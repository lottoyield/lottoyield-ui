FROM nginx:alpine
COPY site /usr/share/nginx/html

# install foundry
RUN curl -L https://foundry.paradigm.xyz | bash
RUN foundryup
