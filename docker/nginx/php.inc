# Diteruskan ke PHP-FPM lewat front controller Laravel.
root /var/www/html/public;
try_files $uri /index.php?$query_string;

fastcgi_pass php;
fastcgi_index index.php;
include fastcgi_params;
fastcgi_param SCRIPT_FILENAME /var/www/html/public/index.php;
fastcgi_param PATH_INFO $fastcgi_path_info;

# Frame kamera base64 bisa besar; default 1 MB terlalu ketat untuk /cv/classify.
client_max_body_size 8m;
fastcgi_read_timeout 30s;
