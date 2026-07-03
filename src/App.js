import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import './App.css';
import { renderSequenceDiagram } from './renderer';

const DEFAULT_CODE = `title: Authentication & Query Flow

actor User [bg: #eff6ff, border: #3b82f6, color: #1e40af]
participant App as Web App [bg: #fcf7f2, border: #f97316, color: #9a3412]
participant API as Gateway Service [bg: #f0fdf4, border: #22c55e, color: #166534]
database DB as Primary Database [bg: #fdf2f8, border: #ec4899, color: #9d174d]

User -> App: Enter username & password
App -> API: POST /auth/login (user, pass) [color: #4f46e5]
activate API [bg: #22c55e, border: #166534]

note over API: Validate credentials\\nand hash passwords [bg: #fef9c3, border: #eab308, color: #713f12]

API -> DB: Query user profile record [color: #22c55e]
activate DB [bg: #ec4899, border: #9d174d]
DB --> API: Return user profile data [color: #64748b]
deactivate DB

API -> API: Verify security hash

alt Success
  API --> App: 200 OK (JWT Access Token) [color: #22c55e]
else Failure
  API --> App: 401 Unauthorized [color: #ef4444]
end

deactivate API
App --> User: Render dashboard interface [color: #4f46e5]
`;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [isReady, setIsReady] = useState(false);
  const [fileName, setFileName] = useState('sequence.txt');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [contentDoc, setContentDoc] = useState(null);
  
  // Parse error state
  const [parseError, setParseError] = useState(null);

  // Layout states
  const [viewMode, setViewMode] = useState('split'); // 'code', 'split', 'diagram'
  const [editorWidth, setEditorWidth] = useState(400);
  const [isDragging, setIsDragging] = useState(false);
  
  // Interactive canvas states
  const [zoom, setZoom] = useState(1.0);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideTab, setGuideTab] = useState('syntax');

  const hasAutoFittedRef = useRef(false);
  const zoomRef = useRef(zoom);
  const translateRef = useRef(translate);

  useEffect(() => {
    hasAutoFittedRef.current = false;
  }, [viewMode]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  // References
  const canvasContainerRef = useRef(null);
  const canvasElRef = useRef(null);
  const paperInstanceRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const dragStartWidthRef = useRef(400);
  const dragStartXRef = useRef(0);

  // Theme Sync
  const isPreview = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      let p = url.searchParams.get("preview");
      if (!p && window.location.hash.includes("?")) {
        const hashParams = new URLSearchParams(window.location.hash.split("?")[1]);
        p = hashParams.get("preview");
      }
      return p === "true";
    } catch (e) {
      return false;
    }
  }, []);

  const getThemeFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      let t = url.searchParams.get("theme");
      if (!t && window.location.hash.includes("?")) {
        const hashParams = new URLSearchParams(window.location.hash.split("?")[1]);
        t = hashParams.get("theme");
      }
      return t;
    } catch (e) {
      return null;
    }
  };

  const [theme, setTheme] = useState(() => {
    const urlTheme = getThemeFromUrl();
    if (urlTheme === "dark" || urlTheme === "light") return urlTheme;
    const preloadTheme = window.pluginAPI?.context?.theme;
    if (preloadTheme === "dark" || preloadTheme === "light") return preloadTheme;
    return localStorage.getItem('sequence-diagram-theme') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('sequence-diagram-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    
    // Safely apply class names without overriding parent classes
    document.documentElement.classList.remove('light-theme', 'dark-theme');
    document.documentElement.classList.add(theme + '-theme');
  }, [theme]);

  // Sync theme when url updates or parent sends message
  useEffect(() => {
    const handleHashChange = () => {
      const urlTheme = getThemeFromUrl();
      if (urlTheme === "dark" || urlTheme === "light") {
        setTheme(urlTheme);
      }
    };
    const handleThemeChange = (e) => {
      const newTheme = e.detail?.theme || e.theme;
      if (newTheme === "dark" || newTheme === "light") {
        setTheme(newTheme);
      }
    };
    const handleMessage = (e) => {
      if (e.data && e.data.type === "theme-changed") {
        const newTheme = e.data.theme;
        if (newTheme === "dark" || newTheme === "light") {
          setTheme(newTheme);
        }
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("theme-changed", handleThemeChange);
    window.addEventListener("message", handleMessage);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("theme-changed", handleThemeChange);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const getFileId = () => {
    let id = window.pluginAPI?.context?.fileId;
    if (id) return id;
    try {
      const url = new URL(window.location.href);
      id = url.searchParams.get("fileId");
      if (!id && window.location.hash.includes("?")) {
        const hashParams = new URLSearchParams(window.location.hash.split("?")[1]);
        id = hashParams.get("fileId");
      }
    } catch (e) {}
    return id;
  };

  const fileId = getFileId();

  // Load block documents initially
  useEffect(() => {
    if (isPreview) {
      let intervalId;
      const handlePreviewMsg = (e) => {
        if (e.data && e.data.type === 'LOAD_PREVIEW') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          const savedData = e.data.data;
          if (savedData && savedData.code) {
            setCode(savedData.code);
          }
          setIsReady(true);
        }
      };
      window.addEventListener('message', handlePreviewMsg);
      
      // Periodic handshake to eliminate mount race conditions with parent page
      const sendReady = () => {
        window.parent.postMessage({ type: 'PREVIEW_READY' }, '*');
      };
      sendReady();
      intervalId = setInterval(sendReady, 250);

      return () => {
        window.removeEventListener('message', handlePreviewMsg);
        if (intervalId) clearInterval(intervalId);
      };
    }

    const loadInitialData = async () => {
      if (window.pluginAPI && fileId) {
        try {
          const fileInfo = await window.pluginAPI.getFileDetailsById(fileId);
          if (fileInfo && fileInfo.title) {
            setFileName(fileInfo.title);
          }

          if (window.pluginAPI.getNestedPath) {
            window.pluginAPI.getNestedPath({ fileId }).then((result) => {
              if (result) {
                const segs = [
                  ...result.folders.map((f) => ({ label: f.name, isFile: false })),
                  ...(result.file ? [{ label: result.file.title, isFile: true }] : []),
                ];
                setBreadcrumbs(segs);
              }
            }).catch(() => {});
          }

          const data = await window.pluginAPI.getDocumentsByParentFile(fileId);
          if (data && data.length > 0) {
            const document = data[0];
            setContentDoc(document);

            let savedData = document?.blocks?.[0]?.data;
            if (typeof savedData === 'string') {
              try {
                savedData = JSON.parse(savedData);
              } catch (e) {}
            }

            if (savedData && typeof savedData === 'object') {
              if (savedData.code !== undefined && savedData.code !== null) {
                setCode(savedData.code);
              }
              if (savedData.viewMode !== undefined) {
                setViewMode(savedData.viewMode);
              } else if (savedData.isEditorCollapsed !== undefined) {
                setViewMode(savedData.isEditorCollapsed ? 'diagram' : 'split');
              }
              if (savedData.editorWidth !== undefined) {
                setEditorWidth(savedData.editorWidth);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to load sequence diagram data:', err);
        } finally {
          setIsReady(true);
        }
      } else {
        setIsReady(true);
      }
    };

    setTimeout(loadInitialData, 100);
  }, [fileId, isPreview]);

  // Save document block data back to system
  const handleSave = useCallback(async (showNotification = true) => {
    if (window.pluginAPI && window.pluginAPI.updateDocument && fileId) {
      const payloadData = { 
        code, 
        viewMode, 
        isEditorCollapsed: viewMode === 'diagram',
        editorWidth 
      };
      const updatedContents = {
        version: "1.0.0",
        time: Date.now(),
        blocks: [{ type: "sequence-diagram", data: payloadData }],
        parent_file: fileId,
        _id: contentDoc?._id,
      };

      try {
        await window.pluginAPI.updateDocument(fileId, [updatedContents]);
        if (showNotification && window.pluginAPI.notify) {
          window.pluginAPI.notify('Diagram saved successfully', 'success');
        }
      } catch (err) {
        console.error('Failed to save document:', err);
      }
    }
  }, [code, viewMode, editorWidth, fileId, contentDoc]);

  // Command/Ctrl + S manual save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!isPreview) handleSave(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isPreview]);

  // Debounced auto-save effect
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isReady || isPreview) return;

    const timeoutId = setTimeout(() => {
      handleSave(false);
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [code, viewMode, editorWidth, handleSave, isReady, isPreview]);

  // Compile code to JointJS Diagram (Debounced)
  // Compile code to Mermaid Diagram (Debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (!code || code.trim().length === 0) {
          setParseError('Add Mermaid code to draw a sequence diagram.');
          return;
        }

        // Remove old paper safely
        if (paperInstanceRef.current) {
          try {
            paperInstanceRef.current.paper.remove();
          } catch (e) {
            console.warn('Failed to remove old paper:', e);
          }
          paperInstanceRef.current = null;
        }

        if (canvasElRef.current) {
          canvasElRef.current.innerHTML = '';
          
          const res = await renderSequenceDiagram({
            code,
            paperEl: canvasElRef.current,
            theme
          });
          
          setParseError(null); // Clear errors since compile succeeded

          if (res) {
            paperInstanceRef.current = res;

            // Auto zoom-to-fit by default if first load, viewMode changed, or hasn't fitted yet
            const svgEl = canvasElRef.current.querySelector('svg');
            if (svgEl) {
              const viewBox = svgEl.getAttribute('viewBox');
              if (viewBox) {
                const parts = viewBox.split(/\s+/).map(Number);
                if (parts.length === 4) {
                  const [, , w, h] = parts;
                  const containerEl = canvasContainerRef.current;
                  if (containerEl) {
                    const containerWidth = containerEl.clientWidth;
                    const containerHeight = containerEl.clientHeight;
                    
                    if (containerWidth > 0 && containerHeight > 0) {
                      const scaleX = (containerWidth - 40) / w;
                      const scaleY = (containerHeight - 40) / h;
                      const fitScale = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));
                      
                      const tx = (containerWidth - w * fitScale) / 2;
                      const ty = (containerHeight - h * fitScale) / 2;
                      
                      const isDefaultState = translateRef.current.x === 0 && translateRef.current.y === 0 && zoomRef.current === 1.0;
                      if (isPreview || !hasAutoFittedRef.current || isDefaultState) {
                        setZoom(fitScale);
                        setTranslate({ x: tx, y: ty });
                        hasAutoFittedRef.current = true;
                      }
                    } else {
                      // Container size not valid yet; ResizeObserver will do the initial fit
                      hasAutoFittedRef.current = false;
                    }
                  }
                }
              }
            }
            
            // Report height changes to parent if in preview
            if (isPreview) {
              const svgEl = canvasElRef.current.querySelector('svg');
              let naturalHeight = 500;
              if (svgEl) {
                const viewBox = svgEl.getAttribute('viewBox');
                if (viewBox) {
                  const parts = viewBox.split(/\s+/).map(Number);
                  if (parts.length === 4) {
                    naturalHeight = parts[3];
                  }
                }
              }
              window.parent.postMessage({ type: 'RESIZE_PREVIEW', height: naturalHeight + 40 }, '*');
            }
          }
        }
      } catch (err) {
        console.error(err);
        setParseError(err.message || String(err));
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [code, theme, isPreview, viewMode, isGuideOpen, editorWidth]);

  // Zoom Controls handlers
  const handleZoomIn = () => {
    const newZoom = Math.min(3.0, zoom + 0.1);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.3, zoom - 0.1);
    setZoom(newZoom);
  };

  const handleZoomReset = () => {
    setZoom(1.0);
    setTranslate({ x: 0, y: 0 });
  };

  const handleZoomFit = useCallback(() => {
    if (!canvasElRef.current || !canvasContainerRef.current) return;
    const svgEl = canvasElRef.current.querySelector('svg');
    if (!svgEl) return;
    
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        const [, , w, h] = parts;
        const containerWidth = canvasContainerRef.current.clientWidth;
        const containerHeight = canvasContainerRef.current.clientHeight;
        
        const scaleX = (containerWidth - 40) / w;
        const scaleY = (containerHeight - 40) / h;
        const fitScale = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));
        
        const tx = (containerWidth - w * fitScale) / 2;
        const ty = (containerHeight - h * fitScale) / 2;
        
        setZoom(fitScale);
        setTranslate({ x: tx, y: ty });
      }
    }
  }, []);

  // Handle container resizing or initial paint after zero-size mount
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          if (isPreview) {
            handleZoomFit();
          } else if (!hasAutoFittedRef.current) {
            handleZoomFit();
            hasAutoFittedRef.current = true;
          }
        }
      }
    });
    
    resizeObserver.observe(canvasContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [isPreview, handleZoomFit]);

  // Drag Panning Canvas mouse handlers
  const handleCanvasMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    if (e.target.closest('.floating-toolbar') || e.target.closest('.parse-error-indicator')) {
      return;
    }
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  };

  const handleCanvasMouseMove = useCallback((e) => {
    if (!isPanningRef.current) return;
    const tx = e.clientX - panStartRef.current.x;
    const ty = e.clientY - panStartRef.current.y;
    setTranslate({ x: tx, y: ty });
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Set up panning listeners on window
  useEffect(() => {
    window.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleCanvasMouseMove);
      window.removeEventListener('mouseup', handleCanvasMouseUp);
    };
  }, [handleCanvasMouseMove, handleCanvasMouseUp]);

  // Sidebar drag resizer handlers
  const handleResizerMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = editorWidth;
  };

  const handleResizerMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartXRef.current;
    const newWidth = Math.max(0, dragStartWidthRef.current + deltaX);
    
    if (newWidth < 120) {
      // Snap collapse
      setViewMode('diagram');
      setEditorWidth(0);
    } else {
      setViewMode('split');
      setEditorWidth(Math.min(700, newWidth));
    }
  }, [isDragging]);

  const handleResizerMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleResizerMouseMove);
      window.addEventListener('mouseup', handleResizerMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleResizerMouseMove);
      window.removeEventListener('mouseup', handleResizerMouseUp);
    };
  }, [isDragging, handleResizerMouseMove, handleResizerMouseUp]);

  // Export handlers
  // eslint-disable-next-line no-unused-vars
  const handleExportSVG = () => {
    setIsExportDropdownOpen(false);
    if (!canvasElRef.current) return;
    const svgEl = canvasElRef.current.querySelector('svg');
    if (!svgEl) return;

    try {
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgEl);
      // Clean up local styles or links if any
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = `${fileName.replace(/\.[^/.]+$/, "")}-sequence.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      console.error(e);
      alert('Failed to export SVG: ' + e.message);
    }
  };

  const handleExportPNG = async () => {
    setIsExportDropdownOpen(false);
    if (!canvasElRef.current) return;
    const svgEl = canvasElRef.current.querySelector('svg');
    if (!svgEl) return;

    try {
      // Clone the SVG element so we do not modify the visible DOM
      const svgClone = svgEl.cloneNode(true);

      // Fetch FontAwesome woff2 file from CDN and convert to base64 Data URL to bypass sandbox cross-origin limitations
      let fontDataUrl = '';
      try {
        const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2');
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(arrayBuffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          fontDataUrl = `data:font/woff2;charset=utf-8;base64,${base64}`;
        }
      } catch (err) {
        console.error('Failed to fetch FontAwesome font for PNG export:', err);
      }

      if (fontDataUrl) {
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = `
          @font-face {
            font-family: 'Font Awesome 6 Free';
            font-style: normal;
            font-weight: 900;
            src: url('${fontDataUrl}') format('woff2');
          }
        `;
        svgClone.insertBefore(styleEl, svgClone.firstChild);
      }

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Parse size from viewBox for consistency independent of client scale
        const viewBox = svgEl.getAttribute('viewBox');
        let width = 800;
        let height = 600;
        if (viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4) {
            width = parts[2];
            height = parts[3];
          }
        }

        // Apply device pixel ratio for super high-res png download
        const dpr = window.devicePixelRatio || 2;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        const context = canvas.getContext('2d');
        context.scale(dpr, dpr);
        
        // Draw background matching theme
        context.fillStyle = theme === 'dark' ? '#0f172a' : '#f8fafc';
        context.fillRect(0, 0, width, height);
        
        context.drawImage(image, 0, 0, width, height);
        
        const png = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = png;
        downloadLink.download = `${fileName.replace(/\.[^/.]+$/, "")}-sequence.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (e) {
      console.error(e);
      alert('Failed to export PNG: ' + e.message);
    }
  };

  const handleExportDS = () => {
    setIsExportDropdownOpen(false);
    try {
      const payloadData = { 
        code, 
        viewMode, 
        isEditorCollapsed: viewMode === 'diagram',
        editorWidth 
      };
      const exportData = {
        _id: contentDoc?._id || `sequence-diagram-${Date.now()}`,
        version: contentDoc?.version || "1.0.0",
        parent_file: fileId,
        blocks: [{ type: "sequence-diagram", data: payloadData }],
        fileType: "sequence-diagram",
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${(fileName || 'sequence').split('.')[0]}.ds`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (window.pluginAPI && window.pluginAPI.notify) {
        window.pluginAPI.notify('Exported successfully', 'success');
      }
    } catch (err) {
      console.error(err);
      if (window.pluginAPI && window.pluginAPI.notify) {
        window.pluginAPI.notify('Export failed', 'error');
      } else {
        alert('Export failed: ' + err.message);
      }
    }
  };

  const aiPromptText = `You are an expert AI assistant that generates Sequence Diagram DSL code.
Here is the specification for the Sequence Diagram DSL:

1. DEFINING PARTICIPANTS:
Syntax:
- [actor | participant | database] [ID] as [Label]
Custom style inside brackets (optional):
- [actor | participant | database] [ID] [bg: #color, border: #color, color: #color]

Example:
actor User as Customer
participant Web as Web App [bg: #eff6ff, border: #3b82f6, color: #1e40af]
database DB as Database

2. MESSAGES / ARROWS:
Syntax:
- Solid Arrow (Synchronous / Request): [ID1] ->> [ID2]: [Message text]
- Dashed Arrow (Asynchronous / Response): [ID1] -->> [ID2]: [Message text]
Custom styling (color and flow animation) inside brackets (optional):
- [ID1] ->> [ID2]: [Message text] [color: #color, moving: true]
Note: Set 'moving: true' to add animated flowing dash effects to arrows representing active data transfers.

Example:
User ->> Web: Place order [color: #3b82f6, moving: true]
Web -->> User: Show confirmation [moving: true]

3. ACTIVATION RECORDS:
Syntax:
- activate [ID] [bg: #color, border: #color]
- deactivate [ID]

Example:
activate Web [bg: #eff6ff, border: #3b82f6]
deactivate Web

4. CONDITIONAL / ALTERNATIVE BLOCKS:
Syntax:
alt [Condition]
  [Messages]
else [Condition]
  [Messages]
end

Example:
alt in stock
  Web ->> DB: Query
else out of stock
  Web -->> User: Error
end

5. NOTES:
Syntax:
- note over [ID]: [Note text]
- note [left of | right of] [ID]: [Note text] [bg: #color]

Example:
note over Web: Process data
note left of Web: Validate input [bg: #fef9c3]

When asked to generate a sequence diagram, only output the raw DSL code. Do not include markdown code block formatting (e.g. \`\`\`), explanations, or extra text.`;

  const handleCopyAIContext = () => {
    navigator.clipboard.writeText(aiPromptText).then(() => {
      if (window.pluginAPI && window.pluginAPI.notify) {
        window.pluginAPI.notify('AI Context copied successfully', 'success');
      } else {
        alert('AI Context copied to clipboard');
      }
    }).catch((err) => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.export-menu-container')) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  return (
    <div className={`App ${theme}-theme ${isPreview ? 'preview-mode' : ''}`} data-theme={theme}>
      {/* Top Header Bar */}
      {!isPreview && (
        <header className="topbar-light">
          <div className="topbar-left">
            <nav
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                fontSize: 12,
                color: 'var(--text-secondary)',
                overflow: 'visible',
                flexWrap: 'nowrap',
              }}
              aria-label="file path"
            >
              <i className="fa-solid fa-folder" style={{ marginRight: 6, fontSize: 11, opacity: 0.7, color: 'var(--text-secondary)' }}></i>
              {(breadcrumbs.length > 0
                ? breadcrumbs
                : [{ label: fileName || "Untitled", isFile: true }]
              ).map((seg, idx) => (
                <React.Fragment key={idx}>
                  {!seg.isFile && (
                    <>
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--text-secondary)',
                          cursor: 'default',
                        }}
                        title={seg.label}
                      >
                        {seg.label}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', opacity: 0.5, margin: '0 4px', fontSize: 13, userSelect: 'none' }}>›</span>
                    </>
                  )}
                  {seg.isFile && (
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        cursor: 'default',
                      }}
                      title={seg.label}
                    >
                      {seg.label.endsWith('.seq') ? seg.label : seg.label + '.seq'}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="topbar-center">
            <div className="view-toggle-group">
              <button 
                className={viewMode === 'code' ? 'active' : ''} 
                onClick={() => setViewMode('code')}
              >
                Code
              </button>
              <button 
                className={viewMode === 'split' ? 'active' : ''} 
                onClick={() => setViewMode('split')}
              >
                Split
              </button>
              <button 
                className={viewMode === 'diagram' ? 'active' : ''} 
                onClick={() => setViewMode('diagram')}
              >
                Diagram
              </button>
            </div>
          </div>
          
          <div className="topbar-right" style={{ gap: '6px' }}>
            <button 
              className={`export-icon-btn ${isGuideOpen ? 'active' : ''}`}
              onClick={() => setIsGuideOpen(!isGuideOpen)} 
              title="Toggle DSL Guide"
            >
              <i className="ri-information-line" style={{ fontSize: '16px' }}></i>
            </button>

            <div className="topbar-divider" />

            {/* Export Dropdown Trigger */}
            <div className="export-menu-container" style={{ position: 'relative' }}>
              <button 
                className="export-icon-btn" 
                onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(!isExportDropdownOpen); }}
                title="Export options"
                id="options-menu-trigger"
              >
                <i className="ri-upload-2-line export-icon"></i>
              </button>
              
              {isExportDropdownOpen && (
                <div className="options-dropdown-menu">
                  <div style={{ padding: "4px 0" }}>
                    <div className="menu-section-header">Export diagram</div>
                    
                    <button
                      className="menu-item-light"
                      id="export-png-btn"
                      onClick={() => {
                        handleExportPNG();
                        setIsExportDropdownOpen(false);
                      }}
                    >
                      <i className="ri-image-line" style={{ marginRight: "10px", color: "#6965db" }}></i>
                      Export as Image (.png)
                    </button>

                    <button
                      className="menu-item-light"
                      id="export-ds-btn"
                      onClick={() => {
                        handleExportDS();
                        setIsExportDropdownOpen(false);
                      }}
                    >
                      <i className="ri-file-code-line" style={{ marginRight: "10px", color: "#6965db" }}></i>
                      Devscribe (.ds)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      ) }

      {/* Main split work area */}
      <div className="workspace-container">
        
        {/* Left Side: Text Code Editor */}
        {!isPreview && viewMode !== 'diagram' && (
          <div 
            className="editor-sidebar"
            style={{ width: viewMode === 'code' ? '100vw' : `${editorWidth}px` }}
          >
            <div className="editor-header">
              <div className="editor-title">
                <i className="fa-solid fa-align-left"></i>
                <span>Sequence DSL</span>
              </div>
            </div>
            
            <div className="editor-scroll-container">
              <CodeMirror
                value={code}
                height="100%"
                theme={theme === 'dark' ? 'dark' : 'light'}
                extensions={[EditorView.lineWrapping]}
                onChange={(val) => setCode(val)}
              />
            </div>
          </div>
        )}

        {/* Divider Resizer Gutter */}
        {!isPreview && viewMode === 'split' && (
          <div 
            className={`resizer-gutter ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleResizerMouseDown}
          />
        )}

        {/* Right Side: Interactive JointJS Canvas */}
        {viewMode !== 'code' && (
          <div 
            className="canvas-container"
            ref={canvasContainerRef}
            onMouseDown={handleCanvasMouseDown}
            style={{ 
              width: isPreview 
                ? '100%'
                : viewMode === 'diagram' 
                  ? (isGuideOpen ? 'calc(100vw - 320px)' : '100vw') 
                  : (isGuideOpen ? `calc(100vw - ${editorWidth}px - 5px - 320px)` : `calc(100vw - ${editorWidth}px - 5px)`) 
            }}
          >
            {/* Parse error alert box */}
            {parseError && (
              <div className="parse-error-indicator">
                <i className="fa-solid fa-circle-exclamation" style={{ marginTop: '2px' }}></i>
                <span>{parseError}</span>
              </div>
            )}

          {/* Paper Viewport */}
          <div className="canvas-viewport">
            <div 
              ref={canvasElRef} 
              className="joint-paper" 
              style={{ 
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`, 
                transformOrigin: '0 0' 
              }} 
            />
          </div>          {/* Floating Controls Toolbar */}
          <div className="floating-toolbar">
            <button className="icon-btn-light" onClick={handleZoomOut} title="Zoom Out">
              <i className="fa-solid fa-magnifying-glass-minus"></i>
            </button>
            <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
            <button className="icon-btn-light" onClick={handleZoomIn} title="Zoom In">
              <i className="fa-solid fa-magnifying-glass-plus"></i>
            </button>
            {!isPreview && (
              <>
                <button className="icon-btn-light" onClick={handleZoomReset} title="Reset Zoom to 1:1">
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
                <button className="icon-btn-light" onClick={handleZoomFit} title="Fit to Screen">
                  <i className="fa-solid fa-expand"></i>
                </button>
              </>
            )}
          </div>
        </div>
      )}

        {/* Right Sidebar: DSL Syntax Guide & AI Context */}
        {isGuideOpen && (
          <div className="guide-sidebar">
            <div className="guide-header">
              <div className="guide-title">
                <i className="fa-solid fa-circle-info"></i>
                <span>Guide</span>
              </div>
              <button className="guide-close-btn" onClick={() => setIsGuideOpen(false)} title="Close Guide">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="guide-tabs">
              <button 
                className={guideTab === 'syntax' ? 'active' : ''} 
                onClick={() => setGuideTab('syntax')}
              >
                DSL Syntax
              </button>
              <button 
                className={guideTab === 'ai' ? 'active' : ''} 
                onClick={() => setGuideTab('ai')}
              >
                AI Context
              </button>
            </div>
            
            {guideTab === 'syntax' && (
              <div className="guide-content">
                <div className="guide-section">
                  <h4>1. Defining Components</h4>
                  <p>Declare your participants at the top of the diagram:</p>
                  <div className="guide-code-block">
                    actor User as Customer<br/>
                    participant Web as Web App<br/>
                    database DB as Database
                  </div>
                  <p><strong>Custom Styling:</strong> Provide background, border, and text colors inside brackets:</p>
                  <div className="guide-code-block">
                    actor User [bg: #eff6ff, border: #3b82f6, color: #1e40af]
                  </div>
                </div>

                <div className="guide-section">
                  <h4>2. Defining Arrows</h4>
                  <div className="guide-item">
                    <span className="guide-item-title">Solid Arrow (Request / Synch)</span>
                    <div className="guide-code-block">
                      User ->> Web: Place order
                    </div>
                  </div>
                  <div className="guide-item">
                    <span className="guide-item-title">Dashed Arrow (Response / Return)</span>
                    <div className="guide-code-block">
                      Web -->> User: Show confirmation
                    </div>
                  </div>
                  <div className="guide-item">
                    <span className="guide-item-title">Custom Colors & Flow Animation</span>
                    <div className="guide-code-block">
                      User ->> Web: Login [color: #3b82f6, moving: true]
                    </div>
                  </div>
                </div>

                <div className="guide-section">
                  <h4>3. Activation Records</h4>
                  <p>Show when a component is actively processing a request:</p>
                  <div className="guide-code-block">
                    activate Web [bg: #eff6ff, border: #3b82f6]<br/>
                    deactivate Web
                  </div>
                </div>

                <div className="guide-section">
                  <h4>4. Conditional Blocks</h4>
                  <p>Wrap messages in alt/else segments to show logical choices:</p>
                  <div className="guide-code-block">
                    alt in stock<br/>
                    &nbsp;&nbsp;API -> DB: Query<br/>
                    else out of stock<br/>
                    &nbsp;&nbsp;API --> User: Error<br/>
                    end
                  </div>
                </div>

                <div className="guide-section">
                  <h4>5. Note Blocks</h4>
                  <p>Add annotations over or relative to lifelines:</p>
                  <div className="guide-code-block">
                    note over API: Process data<br/>
                    note left of Web: Validate [bg: #fef9c3]
                  </div>
                </div>
              </div>
            )}

            {guideTab === 'ai' && (
              <div className="guide-content">
                <div className="guide-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>AI Prompt Context</h4>
                    <button 
                      className="export-icon-btn" 
                      onClick={handleCopyAIContext}
                      title="Copy AI context prompt to clipboard"
                      style={{ width: 'auto', padding: '0 8px', gap: '4px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center' }}
                    >
                      <i className="ri-file-copy-line"></i>
                      <span>Copy Context</span>
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                    Copy this instruction context and paste it to ChatGPT/Claude/Gemini to get perfect sequence diagram code.
                  </p>
                  <div 
                    className="guide-code-block" 
                    style={{ 
                      fontSize: '11px', 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word', 
                      maxHeight: 'calc(100vh - 200px)', 
                      overflowY: 'auto', 
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-tertiary)'
                    }}
                  >
                    {aiPromptText}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
