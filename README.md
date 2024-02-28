<a href="https://hub.docker.com/r/kevinpdavid/sensors2mqtt">
  <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/kevinpdavid/sensors2mqtt">
</a>
&nbsp;
<a href="https://github.com/kevin-david/sensors2mqtt/actions/workflows/docker-image.yml">
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/kevin-david/sensors2mqtt/docker-image.yml">
</a>

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
