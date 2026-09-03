import { useState, useEffect, useRef, type DragEvent, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  Camera,
  Dna,
  Eye,
  FileImage,
  FlaskConical,
  Layers,
  LoaderCircle,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { PlatformPage } from "../components/platform/PlatformLayout";
import {
  MULTIMODAL_MODELS,
  SAMPLE_VISION_IMAGES,
  VISION_PRESETS,
} from "../features/vision/visionPresets";
import {
  analyzeImageWithModel,
  extractPdbCodes,
} from "../features/vision/visionService";
import type {
  MultimodalModelId,
  SampleVisionImage,
  VisionAnalysisPreset,
  VisionMessage,
} from "../features/vision/types";
import "../features/vision/vision.css";

export default function VisionStudioPage() {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState<MultimodalModelId>("minimax/minimax-01");
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [messages, setMessages] = useState<VisionMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check for pending 3D scene snapshot from Laboratory
  useEffect(() => {
    try {
      const pendingSnapshot = sessionStorage.getItem("biofold_pending_vision_snapshot");
      const pendingTarget = sessionStorage.getItem("biofold_pending_vision_target");
      if (pendingSnapshot) {
        setActiveImage(pendingSnapshot);
        setImageName(pendingTarget ? `3D Scene Snapshot (${pendingTarget})` : "3D Laboratory Snapshot");
        sessionStorage.removeItem("biofold_pending_vision_snapshot");
        sessionStorage.removeItem("biofold_pending_vision_target");
      }
    } catch {
      /* ignore storage error */
    }
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAnalyzing]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPEG, WEBP, or SVG).");
      return;
    }
    setError(null);
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setActiveImage(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleLoadSample = (sample: SampleVisionImage) => {
    setActiveImage(sample.dataUri);
    setImageName(sample.name);
    setPromptInput(sample.suggestedPrompt);
    setError(null);
  };

  const handleClearImage = () => {
    setActiveImage(null);
    setImageName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendPrompt = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? promptInput).trim();
    if (!textToSend || !activeImage || isAnalyzing) return;

    setError(null);
    const userMsgId = `user-${Date.now()}`;
    const userMessage: VisionMessage = {
      id: userMsgId,
      role: "user",
      content: textToSend,
      imageUrl: activeImage,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setPromptInput("");
    setIsAnalyzing(true);

    try {
      const response = await analyzeImageWithModel({
        model: selectedModel,
        prompt: textToSend,
        imageDataUri: activeImage,
        conversationHistory: messages,
      });

      const assistantMsg: VisionMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.content,
        timestamp: Date.now(),
        model: selectedModel,
        detectedPdbs: response.detectedPdbs,
        latencyMs: response.latencyMs,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Multimodal analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const currentModelMeta = MULTIMODAL_MODELS.find((m) => m.id === selectedModel);

  return (
    <PlatformPage name="vision" title="Multimodal Vision Studio">
      <main className="bf-vision-page" id="main-content">
        <header className="bf-vision-header">
          <span className="bf-eyebrow">Multimodal Structural Intelligence</span>
          <h1>Multimodal Vision Studio</h1>
          <p>
            Analyze macromolecular electron density maps, cryo-EM micrographs, binding pockets,
            and AlphaFold confidence plots using state-of-the-art vision models.
          </p>
        </header>

        <div className="bf-vision-grid">
          {/* Left Column: Image Source & Model Setup */}
          <section className="bf-vision-controls-panel" aria-label="Visual Inputs and Model Settings">
            {/* Image Card */}
            <div className="bf-vision-card">
              <div className="bf-vision-card-title">
                <FileImage size={16} />
                <span>Structural Image Source</span>
              </div>

              {!activeImage ? (
                <div
                  className={`bf-vision-dropzone ${isDragOver ? "is-dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload molecular image"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="bf-vision-file-input"
                    accept="image/*"
                    onChange={handleInputChange}
                    aria-label="Select image file"
                  />
                  <div className="bf-vision-dropzone-icon">
                    <Upload size={22} />
                  </div>
                  <p>
                    <strong>Click to upload</strong> or drag & drop image
                  </p>
                  <p>PNG, JPG, SVG, or WEBP up to 20MB</p>
                </div>
              ) : (
                <div className="bf-vision-preview-box">
                  <img
                    src={activeImage}
                    alt={imageName || "Selected structure"}
                    className="bf-vision-preview-img"
                  />
                  <div className="bf-vision-preview-overlay">
                    <button
                      type="button"
                      className="bf-vision-icon-btn"
                      onClick={handleClearImage}
                      title="Remove image"
                      aria-label="Remove image"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}

              {activeImage && (
                <div style={{ fontSize: "12px", color: "var(--bf-muted, #79918b)" }}>
                  Loaded: <strong style={{ color: "#fff" }}>{imageName}</strong>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button
                  type="button"
                  className="bf-vision-action-btn"
                  style={{ flex: 1 }}
                  onClick={() => navigate("/app/lab")}
                >
                  <Camera size={14} />
                  <span>Go to 3D Lab</span>
                </button>
              </div>
            </div>

            {/* Model Card */}
            <div className="bf-vision-card">
              <div className="bf-vision-card-title">
                <Sparkles size={16} />
                <span>Multimodal Model</span>
              </div>

              <select
                className="bf-vision-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as MultimodalModelId)}
                aria-label="Select multimodal model"
              >
                {MULTIMODAL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.provider})
                  </option>
                ))}
              </select>

              {currentModelMeta && (
                <div style={{ fontSize: "12px", color: "var(--bf-muted, #79918b)", lineHeight: 1.4 }}>
                  <span className="bf-model-badge" style={{ marginRight: "6px" }}>
                    {currentModelMeta.badge}
                  </span>
                  {currentModelMeta.description}
                </div>
              )}
            </div>

            {/* Curated Scientific Examples */}
            <div className="bf-vision-card">
              <div className="bf-vision-card-title">
                <FlaskConical size={16} />
                <span>Preloaded Examples</span>
              </div>

              <div className="bf-samples-grid">
                {SAMPLE_VISION_IMAGES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className="bf-sample-card"
                    onClick={() => handleLoadSample(sample)}
                    title={sample.description}
                  >
                    <img
                      src={sample.dataUri}
                      alt={sample.name}
                      className="bf-sample-thumb"
                    />
                    <span>{sample.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Right Column: Conversational Vision Workspace */}
          <section className="bf-vision-chat-panel" aria-label="Visual Analysis Conversation">
            <header className="bf-vision-chat-header">
              <h2>
                <Dna size={18} style={{ color: "#5ccfb5" }} />
                <span>Multimodal Structural Analysis</span>
              </h2>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="bf-vision-action-btn"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                  onClick={() => setMessages([])}
                  title="Clear conversation"
                >
                  <RotateCcw size={13} />
                  <span>Clear chat</span>
                </button>
              )}
            </header>

            {/* Preset quick actions */}
            <div className="bf-vision-presets-bar" role="toolbar" aria-label="Quick analysis prompts">
              <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)", fontWeight: 600 }}>
                QUICK ACTIONS:
              </span>
              {VISION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="bf-vision-preset-btn"
                  disabled={!activeImage || isAnalyzing}
                  onClick={() => handleSendPrompt(preset.prompt)}
                >
                  <span>{preset.title}</span>
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="bf-vision-messages">
              {messages.length === 0 ? (
                <div className="bf-vision-empty-conversation">
                  <Sparkles size={40} />
                  <h3>No image analyzed yet</h3>
                  <p>
                    Select one of the preloaded scientific examples on the left, or upload a
                    structural rendering, AlphaFold PAE plot, or cryo-EM map to begin.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <article
                    key={msg.id}
                    className={`bf-vision-message ${msg.role === "user" ? "is-user" : "is-assistant"}`}
                  >
                    <div className="bf-vision-message-meta">
                      <strong>{msg.role === "user" ? "You" : "Vision Copilot"}</strong>
                      {msg.model && <span>· {msg.model.split("/")[1] || msg.model}</span>}
                      {msg.latencyMs && <span>· {(msg.latencyMs / 1000).toFixed(1)}s</span>}
                    </div>

                    <div className="bf-vision-message-bubble">
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>

                      {/* Detected PDBs Quick Actions */}
                      {msg.detectedPdbs && msg.detectedPdbs.length > 0 && (
                        <div className="bf-vision-pdb-actions">
                          <span>Detected Structures:</span>
                          {msg.detectedPdbs.map((pdb) => (
                            <Link
                              key={pdb}
                              to={`/app/lab?pdb=${pdb}`}
                              className="bf-vision-pdb-btn"
                              title={`Inspect ${pdb} in 3D Laboratory`}
                            >
                              <Eye size={12} />
                              <span>Open {pdb} in 3D Studio</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}

              {isAnalyzing && (
                <div className="bf-vision-message is-assistant">
                  <div className="bf-vision-message-meta">
                    <strong>Vision Copilot</strong>
                    <span>· Processing visual reasoning…</span>
                  </div>
                  <div className="bf-vision-message-bubble" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <LoaderCircle size={18} className="bf-spin" style={{ color: "#5ccfb5" }} />
                    <span>Analyzing macromolecular coordinates and topology…</span>
                  </div>
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(229, 62, 62, 0.15)",
                    border: "1px solid rgba(229, 62, 62, 0.3)",
                    color: "#feb2b2",
                    fontSize: "13px",
                  }}
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <footer className="bf-vision-input-box">
              <textarea
                className="bf-vision-textarea"
                placeholder={
                  activeImage
                    ? "Ask anything about this structure or select a quick action above…"
                    : "Load or upload an image to ask questions…"
                }
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendPrompt();
                  }
                }}
                disabled={!activeImage || isAnalyzing}
                rows={1}
                aria-label="Multimodal question prompt"
              />
              <button
                type="button"
                className="bf-vision-send-btn"
                onClick={() => handleSendPrompt()}
                disabled={!activeImage || !promptInput.trim() || isAnalyzing}
                aria-label="Send question to multimodal model"
              >
                {isAnalyzing ? <LoaderCircle size={16} className="bf-spin" /> : <Send size={16} />}
                <span>Analyze</span>
              </button>
            </footer>
          </section>
        </div>
      </main>
    </PlatformPage>
  );
}
