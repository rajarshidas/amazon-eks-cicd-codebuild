# Passes sysdig scan
FROM php:rc-apache

# Fails sysdig scan
#FROM php:7.0-apache

RUN apt-get update && \
    apt-get clean

COPY myapp /var/www/html/
