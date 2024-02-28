<a href="https://hub.docker.com/r/kevinpdavid/sensors2mqtt">
  <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/kevinpdavid/sensors2mqtt">
</a>
&nbsp;
<a href="https://github.com/kevin-david/sensors2mqtt/actions/workflows/docker-image.yml">
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/kevin-david/sensors2mqtt/docker-image.yml">
</a>

pushes lm-sensors and nvidia-smi to mqtt. Also creates home assistant sensors for these resources

`docker-compose.yml`:
```yaml
version: "3.9"
services:
  sensors2mqtt:
    container_name: sensors2mqtt
    privileged: true
    restart: unless-stopped
    image: kevinpdavid/sensors2mqtt:main
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities:
                - gpu
    environment:
      - MQTT_URL=mqtt://mosquitto
      # - MQTT_TOPIC=sensors2mqtt #this is the default
      - INTERVAL=5000 # In milliseconds
      # - MQTT_USERNAME=homeassistant
      # - MQTT_PASSWORD=<your password here>
```

### Run as a service?

Sure thing:

```bash
################################################################################
# A template for docker-compose based service
# Can be put somewhere like /etc/systemd/system/sensors2mqtt.service
# Then enabled/started with `systemctl enable` and `systemctl start `
################################################################################
[Unit]
Description=Docker Compose sensors2mqtt Service
Requires=docker.service
After=docker.service

[Service]
User=kevin
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/kevin/sensors2mqtt
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```
