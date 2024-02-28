FROM nvidia/cuda:12.3.1-base-ubuntu22.04
ARG NODE_MAJOR=20
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
ENV DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y lm-sensors dmidecode curl nvidia-driver-535-server

# install nodejs
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN --mount=type=cache,sharing=locked,target=/var/cache/apt apt update && apt install -y nodejs
RUN --mount=type=cache,target=/root/.npm npm i --global npm

COPY ./ ./
RUN npm install

ENTRYPOINT [ "npm"]
CMD ["run", "start"]
