import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = "https://screen.jahbyte.com";
const role = new URLSearchParams(window.location.search).get("role"); // "broadcaster" or "viewer"

const iceServers = [
  { urls: ["stun:fr-turn3.xirsys.com"] },
  {
    username:
      "e5fQaBUDXOmmdH7fa1V_ho7GZcaTh8vWUhlpNN9pvB907xILRFrfRLM69f_Ba1MdAAAAAGgqZH5qYWhieXRl",
    credential: "aa78979e-343a-11f0-ad4d-0242ac120004",
    urls: [
      "turn:fr-turn3.xirsys.com:80?transport=udp",
      "turn:fr-turn3.xirsys.com:3478?transport=udp",
      "turn:fr-turn3.xirsys.com:80?transport=tcp",
      "turn:fr-turn3.xirsys.com:3478?transport=tcp",
      "turns:fr-turn3.xirsys.com:443?transport=tcp",
      "turns:fr-turn3.xirsys.com:5349?transport=tcp",
    ],
  },
];

const App = () => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const socket = useRef<Socket | null>(null);
  const [started, setStarted] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const logMsg = (msg: string) => setLog((prev) => [...prev, msg]);

  useEffect(() => {
    if (!role) {
      logMsg("No role specified in URL params");
      return;
    }

    logMsg(`Starting app as ${role}`);

    socket.current = io(SERVER_URL);

    pc.current = new RTCPeerConnection({ iceServers });

    socket.current.on("connect", () => {
      logMsg("[Socket] Connected");
    });

    socket.current.on("offer", async (offer) => {
      if (role !== "viewer" || !pc.current) return;
      logMsg("[Viewer] Received offer");

      await pc.current.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      socket.current?.emit("answer", answer);
      logMsg("[Viewer] Sent answer");
    });

    socket.current.on("answer", async (answer) => {
      if (role !== "broadcaster" || !pc.current) return;
      logMsg("[Broadcaster] Received answer");
      await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.current.on("ice-candidate", async (candidate) => {
      if (!pc.current) return;
      try {
        await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
        logMsg("[Any] ICE candidate added");
      } catch (e) {
        logMsg("[Error] ICE candidate failed");
        console.error(e);
      }
    });

    pc.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.current?.emit("ice-candidate", e.candidate);
        logMsg("[Local] Sent ICE candidate");
      }
    };

    pc.current.oniceconnectionstatechange = () => {
      const state = pc.current?.iceConnectionState || "unknown";
      logMsg(`[ICE State] ${state}`);
      if (state === "failed" || state === "disconnected") {
        logMsg("[ICE] Connection lost or failed");
      }
    };

    pc.current.ontrack = (e) => {
      const [remoteStream] = e.streams;
      logMsg("[Viewer] ontrack fired, remoteStream received");

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;

        // Attach media event listeners for better diagnostics
        remoteVideoRef.current.onloadedmetadata = () => {
          logMsg("[Viewer] Metadata loaded, attempting to play remote video");
          remoteVideoRef.current
            ?.play()
            .then(() => logMsg("[Viewer] Remote video playing"))
            .catch((err) => logMsg("[Viewer] Play error: " + err.message));
        };

        remoteVideoRef.current.onwaiting = () => {
          logMsg("[Viewer] Remote video waiting for data...");
        };

        remoteVideoRef.current.oncanplay = () => {
          logMsg("[Viewer] Remote video can play");
        };

        logMsg(
          `readyState after srcObject set: ${remoteVideoRef.current.readyState}`
        );
      }
    };

    return () => {
      logMsg("Cleaning up connection...");
      socket.current?.disconnect();
      pc.current?.close();
    };
  }, []);

  const startBroadcast = async () => {
    if (!pc.current) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      stream.getTracks().forEach((track) => {
        pc.current?.addTrack(track, stream);
      });

      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      socket.current?.emit("offer", offer);
      logMsg("[Broadcaster] Sent offer");
      setStarted(true);
    } catch (err) {
      logMsg("[Error] Unable to start broadcast: " + (err as Error).message);
    }
  };

  const playRemoteVideo = () => {
    if (!remoteVideoRef.current) {
      logMsg("[Viewer] No remote video element found");
      return;
    }
    remoteVideoRef.current
      .play()
      .then(() => logMsg("[Viewer] Remote video manually started"))
      .catch((err) => logMsg("[Viewer] Play error: " + err.message));
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Role: {role}</h1>

      {role === "broadcaster" && (
        <button
          onClick={startBroadcast}
          disabled={started}
          className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer"
        >
          {started ? "Sharing..." : "Start Screen Share"}
        </button>
      )}
      <div className="mx-auto gap-4">
        {role === "broadcaster" && (
          <div>
            <h2 className="font-semibold">Local Video</h2>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-64 md:h-[70vh] bg-black object-contain rounded"
            />
          </div>
        )}

        {role === "viewer" && (
          <div>
            <h2 className="font-semibold">Remote Video</h2>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-64 md:h-[70vh] bg-black object-contain rounded"
            />
          </div>
        )}
      </div>

      {role === "viewer" && (
        <button
          onClick={playRemoteVideo}
          className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer"
        >
          Click to Play Remote Stream
        </button>
      )}
      <div className="bg-gray-900 text-green-300 p-2 text-sm overflow-auto h-48 rounded">
        <pre>{log.join("\n")}</pre>
      </div>
    </div>
  );
};

export default App;
