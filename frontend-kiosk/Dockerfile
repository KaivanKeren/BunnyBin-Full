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

RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
