# Bonapinta API — Laravel 13 on PHP 8.4 (composer.lock requires >= 8.4.1).
# Two targets built from one context:
#   app  → php-fpm (also used, with another command, for the scheduler)
#   web  → nginx serving /public and forwarding PHP to the `app` service

FROM php:8.4-fpm-alpine AS app

COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions pdo_pgsql gd intl bcmath zip opcache
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Dependencies first so this layer is cached until composer.* changes.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --optimize --classmap-authoritative --no-dev --no-scripts \
 && php artisan package:discover --ansi

COPY docker/php.ini /usr/local/etc/php/conf.d/zz-bonapinta.ini
COPY docker/entrypoint.sh /usr/local/bin/bonapinta-entrypoint
RUN chmod +x /usr/local/bin/bonapinta-entrypoint

ENTRYPOINT ["bonapinta-entrypoint"]
CMD ["php-fpm"]


FROM nginx:1.27-alpine AS web
COPY --from=app /var/www/html/public /var/www/html/public
COPY docker/nginx-api.conf /etc/nginx/conf.d/default.conf
