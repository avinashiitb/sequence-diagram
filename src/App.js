import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import './App.css';
import { parseSequenceDiagram } from './parser';
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

  // Refs for sync without triggering effects
  const zoomRef = useRef(zoom);
  const translateRef = useRef(translate);

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
      const handlePreviewMsg = (e) => {
        if (e.data && e.data.type === 'LOAD_PREVIEW') {
          const savedData = e.data.data;
          if (savedData && savedData.code) {
            setCode(savedData.code);
          }
          setIsReady(true);
        }
      };
      window.addEventListener('message', handlePreviewMsg);
      window.parent.postMessage({ type: 'PREVIEW_READY' }, '*');
      return () => window.removeEventListener('message', handlePreviewMsg);
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
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const ast = parseSequenceDiagram(code);
        if (ast.participants.length === 0) {
          setParseError('No actors or participants found. Add code to draw a sequence diagram.');
          return;
        }
        setParseError(null);

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
          // Clear any leftover elements from DOM to avoid duplicate SVGs
          canvasElRef.current.innerHTML = '';
          
          const res = renderSequenceDiagram({
            ast,
            paperEl: canvasElRef.current,
            theme
          });
          if (res) {
            paperInstanceRef.current = res;
            // Restore zoom and translate levels
            res.paper.scale(zoomRef.current);
            res.paper.translate(translateRef.current.x, translateRef.current.y);

            // Report height changes to parent if in preview
            if (isPreview) {
              const svgEl = canvasElRef.current.querySelector('svg');
              const computedHeight = svgEl ? svgEl.getBoundingClientRect().height : 500;
              window.parent.postMessage({ type: 'RESIZE_PREVIEW', height: computedHeight + 20 }, '*');
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
    if (paperInstanceRef.current) {
      paperInstanceRef.current.paper.scale(newZoom);
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.3, zoom - 0.1);
    setZoom(newZoom);
    if (paperInstanceRef.current) {
      paperInstanceRef.current.paper.scale(newZoom);
    }
  };

  const handleZoomReset = () => {
    setZoom(1.0);
    setTranslate({ x: 0, y: 0 });
    if (paperInstanceRef.current) {
      paperInstanceRef.current.paper.scale(1.0);
      paperInstanceRef.current.paper.translate(0, 0);
    }
  };

  const handleZoomFit = () => {
    if (paperInstanceRef.current) {
      const { paper } = paperInstanceRef.current;
      paper.scaleContentToFit({ padding: 30, minScale: 0.3, maxScale: 1.5 });
      const scale = paper.scale();
      const trans = paper.translate();
      setZoom(scale.sx);
      setTranslate({ x: trans.tx, y: trans.ty });
    }
  };

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
    if (paperInstanceRef.current) {
      paperInstanceRef.current.paper.translate(tx, ty);
    }
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

  const handleExportPNG = () => {
    setIsExportDropdownOpen(false);
    if (!canvasElRef.current) return;
    const svgEl = canvasElRef.current.querySelector('svg');
    if (!svgEl) return;

    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        // Retrieve natural SVG boundaries or fallback
        const svgRect = svgEl.getBoundingClientRect();
        const width = svgRect.width || 800;
        const height = svgRect.height || 600;

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
            <div className="logo-badge">
              <span>S</span>
            </div>
            {breadcrumbs.length > 0 ? (
              <span className="file-name">
                {breadcrumbs[breadcrumbs.length - 1].label.endsWith('.seq') 
                  ? breadcrumbs[breadcrumbs.length - 1].label 
                  : breadcrumbs[breadcrumbs.length - 1].label + '.seq'}
              </span>
            ) : (
              <span className="file-name">
                {fileName.endsWith('.seq') ? fileName : fileName + '.seq'}
              </span>
            )}
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
          
          <div className="topbar-right">
            <button 
              className={`icon-btn-light ${isGuideOpen ? 'active-guide' : ''}`}
              onClick={() => setIsGuideOpen(!isGuideOpen)} 
              title="Toggle DSL Guide"
            >
              <i className="fa-solid fa-circle-question"></i>
              <span style={{ fontSize: '12px', fontWeight: '600', marginLeft: '5px' }}>Guide</span>
            </button>

            <button 
              className="icon-btn-light" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <i className="fa-solid fa-sun"></i> : <i className="fa-solid fa-moon"></i>}
            </button>

            {/* Export Dropdown Trigger */}
            <div className="export-menu-container">
              <button 
                className="cta-btn-light" 
                onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(!isExportDropdownOpen); }}
                title="Export Diagram"
              >
                <span>Export</span>
                <i className="fa-solid fa-chevron-down" style={{ fontSize: '10px' }}></i>
              </button>
              
              {isExportDropdownOpen && (
                <div className="export-dropdown">
                  <button className="export-item" onClick={() => { handleExportPNG(); setIsExportDropdownOpen(false); }}>
                    <i className="fa-solid fa-file-image"></i>
                    <span>Export PNG</span>
                  </button>
                  <button className="export-item" onClick={() => { handleExportSVG(); setIsExportDropdownOpen(false); }}>
                    <i className="fa-solid fa-file-code"></i>
                    <span>Export SVG</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

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
              width: viewMode === 'diagram' 
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
            <div ref={canvasElRef} className="joint-paper" />
          </div>          {/* Floating Controls Toolbar */}
          <div className="floating-toolbar">
            <button className="icon-btn-light" onClick={handleZoomOut} title="Zoom Out">
              <i className="fa-solid fa-magnifying-glass-minus"></i>
            </button>
            <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
            <button className="icon-btn-light" onClick={handleZoomIn} title="Zoom In">
              <i className="fa-solid fa-magnifying-glass-plus"></i>
            </button>
            <button className="icon-btn-light" onClick={handleZoomReset} title="Reset Zoom to 1:1">
              <i className="fa-solid fa-rotate-left"></i>
            </button>
            <button className="icon-btn-light" onClick={handleZoomFit} title="Fit to Screen">
              <i className="fa-solid fa-expand"></i>
            </button>
          </div>
        </div>
      )}

        {/* Right Sidebar: DSL Syntax Guide */}
        {isGuideOpen && (
          <div className="guide-sidebar">
            <div className="guide-header">
              <div className="guide-title">
                <i className="fa-solid fa-circle-question"></i>
                <span>DSL Syntax Guide</span>
              </div>
              <button className="guide-close-btn" onClick={() => setIsGuideOpen(false)} title="Close Guide">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
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
                    User -> Web: Place order
                  </div>
                </div>
                <div className="guide-item">
                  <span className="guide-item-title">Dashed Arrow (Response / Return)</span>
                  <div className="guide-code-block">
                    Web --> User: Show confirmation
                  </div>
                </div>
                <div className="guide-item">
                  <span className="guide-item-title">Custom Connector Colors</span>
                  <div className="guide-code-block">
                    User -> Web: Login [color: #3b82f6]
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
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
