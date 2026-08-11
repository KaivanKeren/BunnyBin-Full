# Backend Binexa — PHP-FPM.
#
# Satu image dipakai EMPAT peran berbeda (web, queue:work, mqtt:listen,
# schedule:work); yang membedakan hanya perintahnya di compose. Membuat image
# terpisah per peran hanya menggandakan permukaan yang harus di-patch tanpa
# memberi isolasi apa pun — semuanya butuh basis kode yang sama.

# Image composer:2 membawa PHP-nya sendiri; ia harus >= 8.4.1 agar
# `composer install` lolos platform check dari lock (lihat catatan di bawah).
FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./

# --no-dev: pest, faker, dan sail tidak punya urusan di produksi.
# Script di-skip karena artisan belum ada di stage ini.
RUN composer install \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --no-progress \
    --no-scripts \
    --optimize-autoloader


# PHP 8.4, BUKAN 8.3 — dan ini bukan preferensi.
#
# composer.json menyatakan `"php": "^8.2"`, tapi composer.lock TIDAK bisa
# dijalankan di 8.2/8.3: lock di-resolve di PHP 8.4 sehingga menarik komponen
# Symfony 8.x yang menuntut `php >= 8.4.1` (symfony/string, /translation,
# /event-dispatcher, /yaml, /clock, /css-selector).
#
# Memakai 8.3 tidak gagal saat `composer install` — ia gagal beberapa langkah
# kemudian dengan pesan yang membingungkan dari vendor/composer/platform_check.php:
#   "Your Composer dependencies require a PHP version >= 8.4.1. You are running 8.3.33."
FROM php:8.4-fpm-alpine

# pdo_pgsql — database. sockets — dibutuhkan php-mqtt/client.
# pcntl — dibutuhkan queue:work agar bisa berhenti dengan rapi saat container
# di-stop; tanpanya job yang sedang jalan terpotong di tengah.
RUN apk add --no-cache postgresql-dev linux-headers \
    && docker-php-ext-install pdo_pgsql sockets pcntl \
    && apk del linux-headers

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY . .

# `composer install` di stage vendor melewati script, jadi package discovery
# dijalankan di sini setelah seluruh kode ada.
RUN php artisan package:discover --ansi

# storage & cache harus bisa ditulis oleh www-data; sisanya tidak perlu.
RUN chown -R www-data:www-data storage bootstrap/cache

# Config/route cache SENGAJA TIDAK dibuat saat build: nilainya akan membeku
# dari environment build, bukan environment runtime — dan APP_KEY, kredensial
# DB, serta CV_INTERNAL_TOKEN baru ada saat container dijalankan. Cache dibuat
# di entrypoint compose produksi.

USER www-data

EXPOSE 9000
CMD ["php-fpm"]
