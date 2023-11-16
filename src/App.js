import "./App.css";
import { useRef } from "react";
import YUVCanvas from "./yuv-canvas";

function App() {
  const canvasRef = useRef();
  const rawDiv = useRef();

  const renderImg = (data) => {
    const w = 1024;
    const h = 576;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const tmp = YUVCanvas.draw(w, h, new Uint8Array(data));
    const screenRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(300 * screenRatio);
    canvas.height = Math.floor(168 * screenRatio);
    ctx.save();
    ctx.scale(screenRatio, screenRatio);
    ctx.drawImage(tmp, 0, 0, w, h, 0, 0, 300, 168);
    ctx.restore();

    rawDiv.current.appendChild(tmp);
  };

  return (
    <div className="App">
      <button
        style={{ margin: 20, width: 200, height: 100 }}
        onClick={() => {
          fetch("./raw2023111601.data", {
            responseType: "arraybuffer",
          })
            .then((rest) => rest.arrayBuffer())
            .then((data) => renderImg(data));
        }}
      >
        渲染
      </button>

      <p>Canvas draw webgl canvas</p>
      <canvas style={{ width: 300, height: 168 }} ref={canvasRef} />
      <p>Canvas webgl raw</p>
      <div ref={rawDiv}></div>
    </div>
  );
}

export default App;
