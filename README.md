![Docker Pulls](https://img.shields.io/docker/pulls/kevinpdavid/sensors2mqtt?link=https%3A%2F%2Fhub.docker.com%2Fr%2Fkevinpdavid%2Fsensors2mqtt) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/kevin-david/sensors2mqtt/docker-image.yml)

pushes lm-sensors and nvidia-smi to mqtt. Also creates home assistant sensors for these resources

```yaml
version: "3.3"
services:
  sensors2mqtt:
    restart: unless-stopped
    environment:
      - MQTT_URL=mqtt://mosquitto
      # - MQTT_TOPIC=sensors2mqtt #this is the default
      - INTERVAL=5000
      # - MQTT_USERNAME=homeassistant
      # - MQTT_PASSWORD=<your password here>
    build: /opt/custom_docker/sensors2mqtt
    privileged: true
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities:
                - gpu
```
