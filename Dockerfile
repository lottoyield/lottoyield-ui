# install foundry
FROM ubuntu:20.04
RUN apt-get update
RUN apt-get install -y bash curl git

#FROM markmark206/alpine-bash-curl-jq-git-perl-python-ssh:latest
#SHELL ["/bin/bash", "-c"]
ENV SHELL=/bin/bash

#COPY ./getfoundry.sh ./getfoundry.sh
#RUN sh ./getfoundry.sh

RUN curl -kL https://foundry.paradigm.xyz | sh

#RUN source ~/.bashrc
#ENV PATH="~/.foundry/bin:${PATH}"
#RUN chmod +x ~/.foundry/bin/*
RUN ~/.foundry/bin/foundryup
RUN ~/.foundry/bin/anvil

EXPOSE 8545

# install nginx
#FROM nginx:alpine
#COPY site /usr/share/nginx/html

#ENTRYPOINT ["bash"]