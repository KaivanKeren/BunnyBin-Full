# frontend-kiosk Binexa — build statis, dilayani nginx.
#
# Semua variabel VITE_* di-inline saat BUILD, bukan dibaca saat runtime. Itu
# sebabnya `build-arg` di bawah ada: mengubah VITE_API_URL menuntut build ulang
# image, tidak cukup mengubah environment container.
#
# Konsekuensi yang sama itulah alasan token kiosk TIDAK boleh lewat sini —
# ia akan tertanam permanen di dalam bundle yang dilayankan ke browser.
# Kiosk mengambil tokennya sendiri saat aktivasi (POST /devices/activate).

FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Setelan kamera ikut di-inline saat build karena VITE_* memang bekerja begitu.
# Yang TIDAK di-inline adalah alamat HP-nya (VITE_CAMERA_STREAM_URL): itu hanya
# target proxy nginx, dibaca saat container start lewat CAMERA_STREAM_URL —
# lihat nginx.conf.template. Dengan begitu ganti HP tidak menuntut build ulang.
ARG VITE_CAMERA_SOURCE=auto
ENV VITE_CAMERA_SOURCE=$VITE_CAMERA_SOURCE
ARG VITE_CAMERA_STREAM_PATH=/mjpegfeed?640x480
ENV VITE_CAMERA_STREAM_PATH=$VITE_CAMERA_STREAM_PATH
ARG VITE_CAMERA_ALLOW_BUILTIN_FALLBACK=false
ENV VITE_CAMERA_ALLOW_BUILTIN_FALLBACK=$VITE_CAMERA_ALLOW_BUILTIN_FALLBACK

RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Alamat app kamera di HP. Bisa ditimpa saat runtime (compose/`docker run -e`)
# tanpa build ulang. Filter envsubst dibatasi agar $uri/$host milik nginx aman.
ENV CAMERA_STREAM_URL=http://10.23.3.187:4747
ENV NGINX_ENVSUBST_FILTER=^CAMERA_STREAM_URL$

EXPOSE 80
