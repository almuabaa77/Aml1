import AgoraRTC from "agora-rtc-sdk-ng";

// @ts-ignore
export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || "YOUR_AGORA_APP_ID";

export const agoraClient = AgoraRTC.createClient({ 
  mode: "rtc", 
  codec: "vp8"
});

export default AgoraRTC;
