FROM nginx:1.27-alpine

COPY dist/ /usr/share/nginx/html/

RUN find /usr/share/nginx/html -type d -exec chmod 0755 {} \; \
  && find /usr/share/nginx/html -type f -exec chmod 0644 {} \;
