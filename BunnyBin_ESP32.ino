/*
  ===========================================================================
  IYSA_BUNNYBIN - Pemilah Sampah Otomatis (Organik / Anorganik)
  ESP32-DEVKITC-V4  |  Sesuai schematic: IYSA_BUNNYBIN REV 1.0
  ===========================================================================
  Fungsi:
   - Menggerakkan servo MG996R untuk mengarahkan sampah ke tray organik
     atau anorganik.
   - Membaca 2x sensor ultrasonik HC-SR04 (organik & anorganik) untuk
     mendeteksi ketinggian sampah di masing-masing tray (tinggi tray = 55 cm)
     dan menghitung persentase penuh.
   - Menyediakan REST API sederhana via WiFi lokal supaya dashboard web bisa:
       a. Membaca status level tray (GET /api/status)
       b. Mengirim perintah hasil identifikasi sampah untuk menggerakkan
          servo ke sisi yang benar (POST /api/sort)
       c. Ping untuk cek koneksi (GET /api/ping)
   - IP address ESP32 ditampilkan di Serial Monitor saat boot & berkala,
     supaya bisa diinput manual di halaman konfigurasi web.

  Library yang perlu di-install (Arduino Library Manager):
   - ESP32Servo   (by Kevin Harrington / Dlloydev)
   - ArduinoJson  (by Benoit Blanchon)
   - ESPmDNS      (sudah bundled di ESP32 core, untuk akses bunnybin.local)

  Catatan pretesting:
   - Identifikasi jenis sampah (organik/anorganik) untuk saat ini disimulasikan
     dari SISI WEB (tebak-tebakan), bukan dari computer vision/OCR.
     ESP32 hanya menerima HASIL akhirnya lewat endpoint /api/sort lalu
     menggerakkan servo. Nanti saat OCR/CV sudah siap, tinggal ganti sumber
     nilai "jenis" di endpoint /api/sort dengan hasil dari model CV.
  ===========================================================================
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <ESPmDNS.h>

// ---------------------------------------------------------------------------
// KONFIGURASI WIFI - ganti sesuai jaringan lokal
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "zzz";
const char* WIFI_PASSWORD = "21212121";
const char* MDNS_HOSTNAME = "bunnybin"; // akses via http://bunnybin.local

// ---------------------------------------------------------------------------
// PIN MAPPING - sesuai schematic IYSA_BUNNYBIN REV 1.0
// ---------------------------------------------------------------------------
#define PIN_SERVO            32   // SERVO1 (MG996R) -> MG996R_Signal

#define PIN_TRIG_ORGANIK     25   // HC-SR04_1 (ORGANIK)  -> TRIG
#define PIN_ECHO_ORGANIK     33   // HC-SR04_1 (ORGANIK)  -> ECHO
#define PIN_TRIG_ANORGANIK   27   // HC-SR04_2 (ANORGANIK) -> TRIG
#define PIN_ECHO_ANORGANIK   26   // HC-SR04_2 (ANORGANIK) -> ECHO

// ---------------------------------------------------------------------------
// KONFIGURASI FISIK & SERVO
// ---------------------------------------------------------------------------
const float BIN_HEIGHT_CM   = 55.0;  // tinggi tray sesuai spesifikasi
const int   SERVO_CENTER    = 90;    // posisi netral / idle
const int   SERVO_ORGANIK   = 20;    // posisi tray organik
const int   SERVO_ANORGANIK = 160;   // posisi tray anorganik
const int   SERVO_MOVE_DELAY_MS = 900; // waktu tunggu servo sampai posisi

const float FULL_THRESHOLD_PERCENT = 85.0; // ambang batas "penuh"

// ---------------------------------------------------------------------------
// GLOBAL OBJECTS
// ---------------------------------------------------------------------------
WebServer server(80);
Servo trashServo;

float organikDistanceCm   = BIN_HEIGHT_CM;
float anorganikDistanceCm = BIN_HEIGHT_CM;
float organikPercent      = 0;
float anorganikPercent    = 0;
int   currentServoAngle   = SERVO_CENTER;

unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL_MS = 300;

unsigned long lastSerialPrint = 0;
const unsigned long SERIAL_PRINT_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// UTIL: baca jarak HC-SR04 (cm), return -1 jika timeout / tidak terbaca
// ---------------------------------------------------------------------------
float readDistanceCm(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000UL); // timeout 30ms (~5m)
  if (duration == 0) return -1;

  float distanceCm = duration * 0.0343 / 2.0;
  if (distanceCm < 0 || distanceCm > (BIN_HEIGHT_CM + 20)) return -1;
  return distanceCm;
}

float distanceToPercent(float distanceCm) {
  if (distanceCm < 0) return organikPercent; // biarkan nilai lama jika gagal baca
  float percent = ((BIN_HEIGHT_CM - distanceCm) / BIN_HEIGHT_CM) * 100.0;
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  return percent;
}

void updateSensors() {
  float dOrganik = readDistanceCm(PIN_TRIG_ORGANIK, PIN_ECHO_ORGANIK);
  if (dOrganik > 0) {
    organikDistanceCm = dOrganik;
    organikPercent = distanceToPercent(dOrganik);
  }

  delay(15); // jeda kecil antar sensor supaya tidak saling interferensi pantulan

  float dAnorganik = readDistanceCm(PIN_TRIG_ANORGANIK, PIN_ECHO_ANORGANIK);
  if (dAnorganik > 0) {
    anorganikDistanceCm = dAnorganik;
    anorganikPercent = distanceToPercent(dAnorganik);
  }
}

// ---------------------------------------------------------------------------
// SERVO ACTION
// ---------------------------------------------------------------------------
bool sortTrash(const String& jenis) {
  int targetAngle;
  if (jenis == "organik") {
    targetAngle = SERVO_ORGANIK;
  } else if (jenis == "anorganik") {
    targetAngle = SERVO_ANORGANIK;
  } else {
    return false;
  }

  trashServo.write(targetAngle);
  currentServoAngle = targetAngle;
  delay(SERVO_MOVE_DELAY_MS);

  trashServo.write(SERVO_CENTER);
  currentServoAngle = SERVO_CENTER;
  delay(SERVO_MOVE_DELAY_MS / 2);

  return true;
}

// ---------------------------------------------------------------------------
// CORS HELPER - supaya dashboard web (dibuka dari file lokal / origin lain)
// tetap bisa memanggil API ini
// ---------------------------------------------------------------------------
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptions() {
  sendCorsHeaders();
  server.send(204);
}

// ---------------------------------------------------------------------------
// ENDPOINT: GET /api/status
// ---------------------------------------------------------------------------
void handleStatus() {
  sendCorsHeaders();
  JsonDocument doc;
  doc["device"]              = "BunnyBin";
  doc["ip"]                  = WiFi.localIP().toString();
  doc["organik_distance_cm"]   = round(organikDistanceCm * 10) / 10.0;
  doc["organik_percent"]       = round(organikPercent);
  doc["anorganik_distance_cm"] = round(anorganikDistanceCm * 10) / 10.0;
  doc["anorganik_percent"]     = round(anorganikPercent);
  doc["organik_penuh"]         = organikPercent >= FULL_THRESHOLD_PERCENT;
  doc["anorganik_penuh"]       = anorganikPercent >= FULL_THRESHOLD_PERCENT;
  doc["servo_angle"]           = currentServoAngle;
  doc["uptime_ms"]             = millis();

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ---------------------------------------------------------------------------
// ENDPOINT: GET /api/ping
// ---------------------------------------------------------------------------
void handlePing() {
  sendCorsHeaders();
  JsonDocument doc;
  doc["success"] = true;
  doc["device"]  = "BunnyBin";
  doc["ip"]      = WiFi.localIP().toString();
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ---------------------------------------------------------------------------
// ENDPOINT: POST /api/sort   body: {"jenis":"organik"} atau {"jenis":"anorganik"}
// ---------------------------------------------------------------------------
void handleSort() {
  sendCorsHeaders();

  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"success\":false,\"error\":\"method not allowed\"}");
    return;
  }

  String body = server.arg("plain");
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);

  if (err) {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"invalid json\"}");
    return;
  }

  String jenis = doc["jenis"] | "";
  jenis.toLowerCase();

  if (jenis != "organik" && jenis != "anorganik") {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"jenis harus organik/anorganik\"}");
    return;
  }

  Serial.printf("[SORT] Perintah diterima: %s\n", jenis.c_str());
  bool ok = sortTrash(jenis);

  JsonDocument res;
  res["success"] = ok;
  res["jenis"] = jenis;
  res["servo_angle"] = currentServoAngle;
  String response;
  serializeJson(res, response);
  server.send(200, "application/json", response);
}

void handleNotFound() {
  sendCorsHeaders();
  server.send(404, "application/json", "{\"success\":false,\"error\":\"not found\"}");
}

// ---------------------------------------------------------------------------
// SETUP
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== IYSA_BUNNYBIN booting ===");

  pinMode(PIN_TRIG_ORGANIK, OUTPUT);
  pinMode(PIN_ECHO_ORGANIK, INPUT);
  pinMode(PIN_TRIG_ANORGANIK, OUTPUT);
  pinMode(PIN_ECHO_ANORGANIK, INPUT);

  trashServo.setPeriodHertz(50);
  trashServo.attach(PIN_SERVO, 500, 2400);
  trashServo.write(SERVO_CENTER);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Menghubungkan ke WiFi \"%s\" ", WIFI_SSID);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 40) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi terhubung!");
    Serial.print(">>> IP ADDRESS ESP32  : ");
    Serial.println(WiFi.localIP());
    Serial.println(">>> Gunakan IP ini di halaman konfigurasi dashboard web.");

    if (MDNS.begin(MDNS_HOSTNAME)) {
      Serial.printf(">>> Alternatif akses  : http://%s.local\n", MDNS_HOSTNAME);
    }
  } else {
    Serial.println("\nGagal konek WiFi. Cek SSID/password lalu restart ESP32.");
  }

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/api/ping", HTTP_GET, handlePing);
  server.on("/api/ping", HTTP_OPTIONS, handleOptions);
  server.on("/api/sort", HTTP_POST, handleSort);
  server.on("/api/sort", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("HTTP API server aktif di port 80.");
  Serial.println("Endpoint: GET /api/status | GET /api/ping | POST /api/sort");
}

// ---------------------------------------------------------------------------
// LOOP
// ---------------------------------------------------------------------------
void loop() {
  server.handleClient();

  unsigned long now = millis();

  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    updateSensors();
  }

  if (now - lastSerialPrint >= SERIAL_PRINT_INTERVAL_MS) {
    lastSerialPrint = now;
    Serial.printf("[STATUS] IP:%s | Organik: %.1fcm (%.0f%%) | Anorganik: %.1fcm (%.0f%%)\n",
                  WiFi.localIP().toString().c_str(),
                  organikDistanceCm, organikPercent,
                  anorganikDistanceCm, anorganikPercent);
  }
}
