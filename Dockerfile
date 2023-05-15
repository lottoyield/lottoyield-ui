# install foundry
FROM ubuntu:20.04
RUN apt-get update
RUN apt-get install -y bash curl gcc git nginx
#ENV SHELL=/bin/bash
SHELL ["/bin/bash", "-c"]
RUN curl -kL https://foundry.paradigm.xyz | bash
RUN ~/.foundry/bin/foundryup
EXPOSE 8545
RUN ~/.foundry/bin/anvil

# install nginx
#FROM nginx:alpine
#COPY site /usr/share/nginx/html

#ENTRYPOINT ["bash"]