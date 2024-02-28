import { spawnSync } from "child_process";
import { IClientOptions, connect } from "mqtt";
import { exit } from "process";
import { z } from "zod";
import { hostname } from "os";

const envSchema = z.object({
  MQTT_URL: z.string().url(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_TOPIC: z.string().default("sensors2mqtt"),
  INTERVAL: z.preprocess((arg, ctx) => parseInt(String(arg), 10), z.number()).default(3000)
})

const envResult = envSchema.safeParse(process.env);
if (!envResult.success) {
  console.log("ERROR: Please set all required env vars")
  console.error(envResult.error.message)
  exit(1)
}

const cleanUpServer = (eventType: string) => {
  console.log(`Received ${eventType}, cleaning up`);

  let client = connect(env.MQTT_URL, options);
  client.publish(
    `${env.MQTT_TOPIC}/server`, 
    getAvailabilityPayload('offline'), 
    { retain: true, qos: 1 }, 
    () => { process.exit(0); });
}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
  process.on(eventType, cleanUpServer.bind(null, eventType));
})

const env = envResult.data
let options: IClientOptions;
if (env.MQTT_USERNAME !== undefined || env.MQTT_PASSWORD !== undefined)
{
  options = { username: env.MQTT_USERNAME, password: env.MQTT_PASSWORD }
}

// MQTT discoveries only need to be published once, not once every interval execution
const discoveriesPublished = new Set<string>();

setInterval(() => {
  let client = connect(env.MQTT_URL, options);

  const resultLMSensors = spawnSync("sensors", [
    "-j"
  ]);
  if (resultLMSensors.status == 0) {
    const sensorsOutput = resultLMSensors.stdout.toString()
    let sensorsParsed: Record<string, string | Record<string, any>> = {}
    sensorsParsed = JSON.parse(sensorsOutput);
    // console.log(sensorsParsed);
    for (let [deviceName, deviceData] of Object.entries(sensorsParsed)) {
      deviceName = getMqttTopicFriendlyName(deviceName);

      client.publish(`${env.MQTT_TOPIC}/lm-sensors/${deviceName}`, JSON.stringify(deviceData))

      for (let [sensorName, sensorData] of Object.entries(deviceData)) {
        if (sensorName === "Adapter") continue;
        const haEntity = lmSensorsHaEntity(env.MQTT_TOPIC, deviceName, sensorName, sensorData)
        if (!haEntity) continue;

        if (!discoveriesPublished.has(haEntity.object_id)) {
          client.publish(`homeassistant/sensor/${haEntity.object_id}/config`, JSON.stringify(haEntity))
        }

        discoveriesPublished.add(haEntity.object_id)
      }
    }
  } else {
    console.error("Could not launch sensors:", resultLMSensors.stderr.toString());
  }

  const resultNvidiaSMI = spawnSync("nvidia-smi", [
    "--query-gpu=gpu_name,gpu_bus_id,temperature.gpu,utilization.gpu,utilization.memory,memory.free,memory.used", "--format=csv"
  ]);
  if (resultNvidiaSMI.status == 0) {
    const nvidiaSMIOutput = resultNvidiaSMI.stdout.toString()
    const nvidiaSMIParsed = parseNvidiaSMI(nvidiaSMIOutput);
    // console.log(nvidiaSMIParsed);
    for (let [deviceName, deviceData] of Object.entries(nvidiaSMIParsed)) {
      deviceName = getMqttTopicFriendlyName(deviceName);
      client.publish(`${env.MQTT_TOPIC}/nvidia-smi/${deviceName}`, JSON.stringify(deviceData))
      
      for (const [sensorName, sensorData] of Object.entries(deviceData)) {
        try {
          const haEntity = nvidiaSmiHaEntity(env.MQTT_TOPIC, deviceData["name"], deviceName, sensorName, sensorData)
          if (!haEntity) continue;

          if (!discoveriesPublished.has(haEntity.object_id))
          {
            client.publish(`homeassistant/sensor/${haEntity.object_id}/config`, JSON.stringify(haEntity))
          }

          discoveriesPublished.add(haEntity.object_id)
        } catch (e) {
          console.log("Could not generate HA MQTT discovery entity", e as Error)
        }
      }
    }
  }

  client.publish(
    `${env.MQTT_TOPIC}/server`, 
    getAvailabilityPayload('online'));
}, env.INTERVAL)

const getAvailabilityPayload = (availability: "online" | "offline") => {
  return JSON.stringify({ state: availability, last_update: Date.now()/1000 })
}

// Theoretically this should work on a restart or something, but in pratice Home Assistant doesn't seem to
// re-evaluate the availability_template outside of actual topic updates 
const availabilityTemplate = 
  '{% if value_json.state == "online" and as_datetime(value_json.last_update) > now() - timedelta(minutes = 1) %} online {% else %} offline {% endif %}'

const lmSensorsHaEntity = (
  topic: string,
  deviceName: string,
  sensorName: string,
  sensorData: Record<string, any>
) => {

  let sensorType = undefined;
  let unit = undefined;
  if (Object.keys(sensorData).find((key) => key.startsWith("in"))) {
    sensorType = "voltage";
    unit = "V";
  }
  if (Object.keys(sensorData).find((key) => key.startsWith("temp"))) {
    sensorType = "temperature";
    unit = "°C";
  }
  if (Object.keys(sensorData).find((key) => key.startsWith("fan"))) {
    sensorType = null;
    unit = "RPM";
  }
  if (sensorType === undefined) {
    console.log("unknown sensor type", sensorName, sensorData);
    return null;
  }
  const x_input = Object.keys(sensorData).find((key) => key.endsWith("_input"));
  if (!x_input) return null;

  const cleanSensorName = getMqttTopicFriendlyName(sensorName);
  let haEntity = {
    availability_topic: `${topic}/server`,
    availability_template: availabilityTemplate,
    device: {
      identifiers: [`${topic}/${deviceName}`],
      manufacturer: "sensors2mqtt",
      model: hostname(),
      name: deviceName,
    },
    enabled_by_default: true,
    device_class: sensorType,
    state_class: "measurement",
    name: sensorName,
    object_id: `lm-sensors_${deviceName}/${cleanSensorName}`,
    origin: {
      name: "lm-sensors2mqtt",
      sw: "0.0.2",
    },
    unit_of_measurement: unit,
    state_topic: `${topic}/lm-sensors/${deviceName}`,
    unique_id: `lm-sensors_${deviceName.replace(" ", "_")}_${cleanSensorName}`,
    value_template: `{{ value_json["${sensorName}"]["${x_input}"] }}`,
  };

  return haEntity;
};


const parseNvidiaSMI = (nvidiaSMIOutput: string) => {
  let nvidiaSMIParsed: Record<string, Record<string, string>> = {}
  const header = nvidiaSMIOutput.split("\n")[0];
  const cols = header.split(",");
  const rows = nvidiaSMIOutput.split("\n").slice(1)
  for (const row of rows) {
    const data = row.split(",");
    if (data.length !== cols.length) continue;
    const deviceData: Record<string, string> = {}
    for (const index in cols) {
      const column = cols[index].trim().replace(" [%]", "").replace(" [MiB]", "");
      deviceData[column] = data[index].trim().replace(" %", "").replace(" MiB", "");
    }
    nvidiaSMIParsed[deviceData["pci.bus_id"]] = deviceData
  }
  return nvidiaSMIParsed;
}

const nvidiaSmiHaEntity = (
  topic: string,
  model: string,
  deviceName: string,
  sensorName: string,
  sensorData: string
) => {
  if (sensorName === "pci.bus_id" || sensorName === "name") return null;
  let sensorType = undefined;
  let unit = undefined;
  let data = sensorData.trim();
  if (sensorName === "temperature.gpu") {
    sensorType = "temperature";
    unit = "°C";
  }
  if (sensorName === "utilization.gpu" || sensorName === "utilization.memory") {
    sensorType = null;
    unit = "%";
    data = data.replace("%", "").trim();
  }
  if (sensorName === "memory.free" || sensorName === "memory.used") {
    sensorType = null;
    unit = "MiB";
    data = data.replace("MiB", "").trim();
  }
  if (sensorType === undefined) {
    console.log("unknown sensor type", sensorName, sensorData);
    return null;
  }
  const cleanSensorName = getMqttTopicFriendlyName(sensorName)
  return {
    availability_topic: `${topic}/server`,
    availability_template: availabilityTemplate,
    device: {
      identifiers: [`${topic}/${deviceName}`],
      manufacturer: "NVidia",
      model,
      name: deviceName,
    },
    enabled_by_default: true,
    device_class: sensorType,
    state_class: "measurement",
    name: sensorName,
    object_id: `nvidia-smi_${deviceName}/${cleanSensorName}`,
    origin: {
      name: "nvidia-smi2mqtt",
      sw: "0.0.2",
    },
    unit_of_measurement: unit,
    state_topic: `${topic}/nvidia-smi/${deviceName}`,
    unique_id: `nvidia-smi_${deviceName}_${cleanSensorName})`,
    value_template: `{{ value_json["${sensorName}"] }}`,
  };
};

// Sensor or device names names that make it to MQTT topics must follow a specific format
// https://www.home-assistant.io/integrations/mqtt#discovery-messages
const getMqttTopicFriendlyName = (sensorOrDeviceName: string) => {
  return sensorOrDeviceName.replace(/ /g, "_").replace(/\./g, "_").replace(/:/g, "_");
}
