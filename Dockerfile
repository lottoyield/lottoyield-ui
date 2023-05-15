FROM markmark206/alpine-bash-curl-jq-git-perl-python-ssh:latest
SHELL ["/bin/bash", "-c"]
ENV SHELL=/bin/bash
RUN curl -kL https://foundry.paradigm.xyz | sh
#RUN source ~/.bashrc
#ENV PATH="~/.foundry/bin:${PATH}"
RUN ~/.foundry/bin/foundryup
#RUN ~/.foundry/bin/anvil
