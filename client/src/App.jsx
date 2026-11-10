import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Trash2, Copy, CheckSquare } from 'lucide-react';
import { socket } from './socket';
import { TOOLS, USER_COLORS, STICKY_COLORS, slugifyRoomName } from './constants';
import { 
  renderElement, 
  isPointHittingElement, 
  renderSelectionBox, 
  getResizeHandle,
  isElementInRect,
  isElementInPolygon,
  getGroupBounds,
  renderMarqueeBox,
  renderLassoRegion,
  renderGroupSelection
} from './utils/canvas';
import { setImageLoadHandler, loadImage } from './utils/images';
import Header from './components/Header';
import Toolbar from './components/Toolbar';
import RemoteCursors from './components/RemoteCursors';
import ZoomControls from './components/ZoomControls';
import UserNameModal from './components/UserNameModal';
import PageBar from './components/PageBar';
import LatexModal from './components/LatexModal';
import ProjectsModal from './components/ProjectsModal';
import TimelapseModal from './components/TimelapseModal';
import { generateSyntheticEvents } from './utils/timelapse';

export default function App() {
  // Room and User setup
  const [roomId, setRoomId] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);

  // Timelapse Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [timelapseData, setTimelapseData] = useState(null);
  const [isTimelapseModalOpen, setIsTimelapseModalOpen] = useState(false);

  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef(0);
  const recordingEventsRef = useRef([]);
  const recordingInitialRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Canvas elements state
  const [elements, setElements] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Active tools & style state
  const [activeTool, setActiveTool] = useState(TOOLS.PENCIL);
  const [prevTool, setPrevTool] = useState(TOOLS.PENCIL);
  const [color, setColor] = useState('#1e293b');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fillShape, setFillShape] = useState(false);
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);
  // 'element' apaga o elemento inteiro; 'partial' apaga só o trecho sob o cursor
  const [eraserMode, setEraserMode] = useState('element');

  // Pages & background
  const [pages, setPages] = useState([]);
  const [activePageId, setActivePageId] = useState('');
  const activePage = pages.find((page) => page.id === activePageId);
  const bg = activePage?.bg || { color: '#f8fafc', grid: 'dots' };

  // Save status & LaTeX modal
  const [saveStatus, setSaveStatus] = useState('');
  const [latexModal, setLatexModal] = useState(null);
  const [imageTick, setImageTick] = useState(0);

  // Viewport navigation (Pan & Zoom)
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Active drawing/interaction state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState(null);
  const [selectedElementIds, setSelectedElementIds] = useState([]);
  const selectedElementId = selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const setSelectedElementId = useCallback((id) => {
    setSelectedElementIds(id ? [id] : []);
  }, []);
  const [selectionBox, setSelectionBox] = useState(null); // { startX, startY, endX, endY }
  const [selectionLasso, setSelectionLasso] = useState(null); // [{ x, y }, ...]
  const isSelectingMarqueeRef = useRef(false);
  const isSelectingLassoRef = useRef(false);
  const isDraggingGroupRef = useRef(false);
  const groupOriginalPositionsRef = useRef(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [isResizingElement, setIsResizingElement] = useState(false);
  const [hoverHandle, setHoverHandle] = useState(null);
  const dragStartPointRef = useRef(null);
  const elementOriginalPosRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const resizeStartPointRef = useRef(null);
  const resizeOriginalElRef = useRef(null);

  // In-flight previews from other users: socketId -> element
  const [remotePreviews, setRemotePreviews] = useState({});
  // Remote cursors: socketId -> { name, color, x, y }
  const [remoteCursors, setRemoteCursors] = useState({});

  // Inline editing overlay for text / sticky notes
  const [editingText, setEditingText] = useState(null); // { id, x, y, text, type, bg, textColor }

  // Canvas DOM ref
  const canvasRef = useRef(null);
  const lastPanPointRef = useRef(null);
  const lastCursorSendRef = useRef(0);
  const roomIdRef = useRef('');
  const userRef = useRef(null);
  const activePageIdRef = useRef('');
  const currentElementRef = useRef(null);
  const editingTextRef = useRef(null);
  const commitEditingRef = useRef(null);
  const isDraggingElementRef = useRef(false);
  const selectedElementIdRef = useRef(null);
  const elementsRef = useRef([]);
  const joinedRef = useRef(false);
  const outboxRef = useRef([]);
  const eraseSessionRef = useRef(null);

  // Eventos de conteúdo ficam na fila enquanto não estamos na sala; sem isso
  // o socket.io os envia antes do join_room depois de uma queda e o servidor
  // os descarta (o usuário perderia o que desenhou offline).
  const send = useCallback((event, payload) => {
    if (socket.connected && joinedRef.current) {
      socket.emit(event, payload);
    } else {
      outboxRef.current.push([event, payload]);
    }
  }, []);

  const recordEvent = useCallback((type, payload = {}) => {
    if (!isRecordingRef.current) return;
    const timestamp = Date.now() - recordingStartTimeRef.current;
    recordingEventsRef.current.push({
      type,
      timestamp,
      ...payload
    });
  }, []);

  const handleStartRecording = useCallback(() => {
    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordingDuration(0);
    recordingStartTimeRef.current = Date.now();
    recordingInitialRef.current = {
      elements: JSON.parse(JSON.stringify(elementsRef.current)),
      bg: JSON.parse(JSON.stringify(bg))
    };
    recordingEventsRef.current = [];
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  }, [bg]);

  const handleStopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const durationMs = Math.max(1000, Date.now() - recordingStartTimeRef.current);
    const data = {
      events: [...recordingEventsRef.current],
      totalDuration: durationMs,
      initialElements: recordingInitialRef.current?.elements || [],
      bg: recordingInitialRef.current?.bg || bg,
      isLiveRecorded: true
    };
    setTimelapseData(data);
    setIsTimelapseModalOpen(true);
  }, [bg]);

  const handleOpenTimelapse = useCallback(() => {
    if (isRecordingRef.current) {
      handleStopRecording();
      return;
    }

    if (recordingEventsRef.current.length > 0) {
      const durationMs = Math.max(1000, recordingDuration * 1000 || 5000);
      setTimelapseData({
        events: [...recordingEventsRef.current],
        totalDuration: durationMs,
        initialElements: recordingInitialRef.current?.elements || [],
        bg: recordingInitialRef.current?.bg || bg,
        isLiveRecorded: true
      });
      setIsTimelapseModalOpen(true);
      return;
    }

    if (elements.length === 0) {
      alert('Desenhe algo no quadro ou inicie uma gravação antes de abrir o Time Lapse.');
      return;
    }

    const synth = generateSyntheticEvents(elements, bg);
    setTimelapseData(synth);
    setIsTimelapseModalOpen(true);
  }, [elements, bg, recordingDuration, handleStopRecording]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // Redesenha quando uma imagem (foto ou LaTeX) termina de carregar
  useEffect(() => {
    setImageLoadHandler(() => setImageTick((tick) => tick + 1));
  }, []);

  // 1. Initialize Room ID & User info on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let rId = params.get('room');
    if (!rId) {
      rId = 'quadro-' + Math.random().toString(36).substring(2, 7);
      const newUrl = `${window.location.pathname}?room=${rId}`;
      window.history.replaceState(null, '', newUrl);
    }
    roomIdRef.current = rId;
    setRoomId(rId);

    const savedName = localStorage.getItem('wb_username') || `Amigo ${Math.floor(Math.random() * 899 + 100)}`;
    const savedColor = localStorage.getItem('wb_usercolor') || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    
    const user = { name: savedName, color: savedColor };
    userRef.current = user;
    setCurrentUser(user);

    // Connect to room via socket
    socket.emit('join_room', { roomId: rId, user });

    // Reentra na sala depois de uma reconexão (servidor reiniciado, rede caiu)
    socket.on('connect', () => {
      joinedRef.current = false;
      if (roomIdRef.current && userRef.current) {
        socket.emit('join_room', { roomId: roomIdRef.current, user: userRef.current });
      }
    });

    socket.on('disconnect', () => {
      joinedRef.current = false;
    });

    // Socket listeners
    socket.on('room_init', ({ pages: roomPages, activePageId: initialPageId, elements: initialElements, users: roomUsers, selfId }) => {
      setPages(roomPages || []);
      setActivePageId(initialPageId || '');
      setElements(initialElements || []);
      setUsers(roomUsers || []);
      setRemoteCursors({});
      setRemotePreviews({});
      setCurrentUser(prev => ({ ...prev, id: selfId }));

      // Reenvia o que foi feito enquanto estávamos fora da sala
      joinedRef.current = true;
      const queued = outboxRef.current;
      outboxRef.current = [];
      queued.forEach(([event, payload]) => socket.emit(event, payload));
    });

    socket.on('page_added', ({ pages: roomPages, activePageId: newPageId }) => {
      setPages(roomPages || []);
      setActivePageId(newPageId || '');
    });

    socket.on('page_switched', ({ activePageId: newPageId, elements: pageElements }) => {
      // Termina o que estava em andamento na página de origem
      if (editingTextRef.current) commitEditingRef.current?.();
      if (isDraggingElementRef.current && selectedElementIdRef.current) {
        const dragged = elementsRef.current.find(el => el.id === selectedElementIdRef.current);
        if (dragged) send('element_update', dragged);
      }
      if (currentElementRef.current) send('element_create', currentElementRef.current);

      // Sem isso, um traço/borracha em andamento continuaria na página nova
      setIsDrawing(false);
      eraseSessionRef.current = null;
      setIsDraggingElement(false);
      lastPanPointRef.current = null;
      dragStartPointRef.current = null;
      elementOriginalPosRef.current = null;

      setActivePageId(newPageId);
      setElements(pageElements || []);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElementId(null);
      setEditingText(null);
      setCurrentElement(null);
      setRemotePreviews({});
      setLatexModal(null);
    });

    socket.on('page_deleted', ({ deletedPageId, pages: newPages, activePageId: newPageId, elements: pageElements }) => {
      setPages(newPages || []);
      setIsDrawing(false);
      eraseSessionRef.current = null;
      setIsDraggingElement(false);
      setIsResizingElement(false);
      resizeHandleRef.current = null;
      lastPanPointRef.current = null;
      dragStartPointRef.current = null;
      elementOriginalPosRef.current = null;

      setActivePageId(newPageId);
      setElements(pageElements || []);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElementId(null);
      setEditingText(null);
      setCurrentElement(null);
      setRemotePreviews({});
      setLatexModal(null);
    });

    socket.on('page_bg_updated', ({ pageId, bg: pageBg }) => {
      setPages(prev => prev.map(p => (p.id === pageId ? { ...p, bg: pageBg } : p)));
    });

    socket.on('saved', ({ at }) => {
      const time = at ? new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      setSaveStatus(time ? `Salvo às ${time}` : 'Salvo');
      setTimeout(() => setSaveStatus(''), 4000);
    });

    socket.on('user_joined', ({ users: updatedUsers }) => {
      setUsers(updatedUsers || []);
    });

    socket.on('user_left', ({ socketId, users: updatedUsers }) => {
      setUsers(updatedUsers || []);
      setRemoteCursors(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      setRemotePreviews(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    socket.on('users_updated', (updatedUsers) => {
      setUsers(updatedUsers);
    });

    socket.on('cursor_updated', (cursorData) => {
      setRemoteCursors(prev => ({
        ...prev,
        [cursorData.socketId]: cursorData
      }));
    });

    socket.on('element_preview', ({ socketId, element: previewEl }) => {
      if (previewEl?.pageId && previewEl.pageId !== activePageIdRef.current) return;
      setRemotePreviews(prev => ({
        ...prev,
        [socketId]: previewEl
      }));
    });

    socket.on('element_created', ({ socketId, element: newEl }) => {
      if (newEl?.pageId && newEl.pageId !== activePageIdRef.current) return;
      setElements(prev => {
        // Prevent duplicate if already in state
        if (prev.some(el => el.id === newEl.id)) return prev;
        return [...prev, newEl];
      });
      // Clear remote preview if any
      setRemotePreviews(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      recordEvent('element_commit', { element: newEl });
    });

    socket.on('element_updated', (updatedEl) => {
      if (updatedEl?.pageId && updatedEl.pageId !== activePageIdRef.current) return;
      setElements(prev => prev.map(el => (el.id === updatedEl.id ? updatedEl : el)));
      recordEvent('element_update', { element: updatedEl });
    });

    socket.on('elements_deleted', ({ elementIds }) => {
      const idSet = new Set(elementIds);
      setElements(prev => prev.filter(el => !idSet.has(el.id)));
      recordEvent('elements_delete', { elementIds });
    });

    socket.on('canvas_cleared', () => {
      setElements([]);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElementId(null);
      recordEvent('clear', {});
    });

    socket.on('room_renamed', ({ oldRoomId, newRoomId }) => {
      roomIdRef.current = newRoomId;
      setRoomId(newRoomId);
      const newUrl = `${window.location.pathname}?room=${encodeURIComponent(newRoomId)}`;
      window.history.replaceState(null, '', newUrl);
    });

    socket.on('room_error', (msg) => {
      alert(msg || 'Erro na sala.');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_init');
      socket.off('room_renamed');
      socket.off('room_error');
      socket.off('page_added');
      socket.off('page_deleted');
      socket.off('page_switched');
      socket.off('page_bg_updated');
      socket.off('saved');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('users_updated');
      socket.off('cursor_updated');
      socket.off('element_preview');
      socket.off('element_created');
      socket.off('element_updated');
      socket.off('elements_deleted');
      socket.off('canvas_cleared');
    };
  }, []);

  // Update User Profile
  const handleSaveProfile = ({ name, color }) => {
    localStorage.setItem('wb_username', name);
    localStorage.setItem('wb_usercolor', color);
    setCurrentUser(prev => ({ ...prev, name, color }));
    send('update_user', { name, color });
  };

  // Rename Room
  const handleRenameRoom = (newName) => {
    const sanitized = slugifyRoomName(newName);
    if (!sanitized || sanitized === roomId) return;
    socket.emit('room_rename', { newRoomId: sanitized });
  };

  // Convert screen coordinates to canvas world coordinates
  const getCanvasCoords = useCallback((screenX, screenY) => {
    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom
    };
  }, [panOffset, zoom]);

  const addElement = useCallback((element) => {
    setElements(prev => [...prev, element]);
    setUndoStack(prev => [...prev, { action: 'create', element }]);
    setRedoStack([]);
    send('element_create', element);
    recordEvent('element_commit', { element });
  }, [send, recordEvent]);

  // Handle Canvas Resize and DPI
  const setupCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }, []);

  useEffect(() => {
    setupCanvasSize();
    window.addEventListener('resize', setupCanvasSize);
    return () => window.removeEventListener('resize', setupCanvasSize);
  }, [setupCanvasSize]);

  // Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Apply viewport Pan & Zoom transform
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Render all committed elements
    elements.forEach(el => {
      renderElement(ctx, el);

      // Render selection outline if single element selected
      if (selectedElementIds.length === 1 && el.id === selectedElementId) {
        renderSelectionBox(ctx, el, zoom);
      }
    });

    // Render group selection outline if multiple elements selected
    if (selectedElementIds.length > 1) {
      const selectedEls = elements.filter(el => selectedElementIds.includes(el.id));
      const groupBounds = getGroupBounds(selectedEls);
      renderGroupSelection(ctx, groupBounds, zoom);
    }

    // Render in-progress rectangular marquee selection box
    if (selectionBox) {
      renderMarqueeBox(ctx, selectionBox, zoom);
    }

    // Render in-progress lasso selection region
    if (selectionLasso) {
      renderLassoRegion(ctx, selectionLasso, zoom);
    }

    // Render previews from other connected users
    Object.values(remotePreviews).forEach(previewEl => {
      if (previewEl) renderElement(ctx, previewEl);
    });

    // Render current active element being drawn locally
    if (currentElement) {
      renderElement(ctx, currentElement);
    }

    ctx.restore();
  }, [elements, remotePreviews, currentElement, panOffset, zoom, selectedElementIds, selectionBox, selectionLasso, imageTick]);

  // Borracha parcial: apaga só os pontos do traço que passam sob o cursor,
  // quebrando o traço em pedaços para não deixar um risco atravessando o vão.
  const partialEraseAt = (x, y) => {
    const session = eraseSessionRef.current;
    if (!session) return;

    const radius = 14 / zoom;
    const next = [];
    const removed = [];
    const created = [];

    session.working.forEach((el) => {
      if (el.type === 'pencil' || el.type === 'highlighter') {
        const threshold = radius + (el.width || 4) / 2;
        const points = el.points || [];
        if (!points.some((p) => Math.hypot(p.x - x, p.y - y) <= threshold)) {
          next.push(el);
          return;
        }

        const runs = [];
        let run = [];
        points.forEach((p) => {
          if (Math.hypot(p.x - x, p.y - y) <= threshold) {
            if (run.length) runs.push(run);
            run = [];
          } else {
            run.push(p);
          }
        });
        if (run.length) runs.push(run);

        removed.push(el);
        runs.forEach((fragmentPoints, index) => {
          const fragment = {
            ...el,
            id: `${el.id}_p${Date.now()}_${index}_${Math.random().toString(36).substring(2, 5)}`,
            points: fragmentPoints
          };
          next.push(fragment);
          created.push(fragment);
        });
      } else if (isPointHittingElement({ x, y }, el, radius)) {
        removed.push(el);
      } else {
        next.push(el);
      }
    });

    if (!removed.length) return;

    session.working = next;
    setElements(next);
    send('elements_delete', removed.map((el) => el.id));
    created.forEach((el) => send('element_create', el));
  };

  // Fecha o gesto da borracha parcial com um único passo de desfazer
  const commitEraseSession = () => {
    const session = eraseSessionRef.current;
    eraseSessionRef.current = null;
    if (!session) return;

    const finalIds = new Set(session.working.map((el) => el.id));
    const removed = session.initial.filter((el) => !finalIds.has(el.id));
    const added = session.working.filter((el) => !session.initialIds.has(el.id));
    if (removed.length || added.length) {
      setUndoStack((prev) => [...prev, { action: 'erase', removed, added }]);
      setRedoStack([]);
    }
  };

  // Pointer event handlers (mouse, touch, stylus)
  const handlePointerDown = (e) => {
    // Only respond to primary button
    if (e.button !== 0 && e.button !== 1) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Garante que pointerup chegue ao canvas mesmo soltando sobre o cabeçalho
    canvas.setPointerCapture(e.pointerId);

    // Pan with middle mouse button or Hand tool or Spacebar
    if (e.button === 1 || activeTool === TOOLS.HAND || isSpacePressed) {
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    const id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pageId = activePageIdRef.current;

    // Ferramenta de Seleção em Retângulo (Marquee)
    if (activeTool === TOOLS.SELECT_RECT) {
      isSelectingMarqueeRef.current = true;
      setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
      return;
    }

    // Ferramenta de Seleção de Região (Lasso)
    if (activeTool === TOOLS.SELECT_LASSO) {
      isSelectingLassoRef.current = true;
      setSelectionLasso([{ x, y }]);
      return;
    }

    // Select Tool: hit-test elements from top to bottom, group dragging, or resize handles
    if (activeTool === TOOLS.SELECT) {
      if (selectedElementId) {
        const selectedEl = elements.find(el => el.id === selectedElementId);
        const handle = getResizeHandle(selectedEl, { x, y }, zoom);
        if (handle) {
          setIsResizingElement(true);
          resizeHandleRef.current = handle;
          resizeStartPointRef.current = { x, y };
          resizeOriginalElRef.current = JSON.parse(JSON.stringify(selectedEl));
          return;
        }
      }

      const selectedGroup = elements.filter(el => selectedElementIds.includes(el.id));
      const groupBounds = getGroupBounds(selectedGroup);
      const hitSelected = selectedGroup.some(el => isPointHittingElement({ x, y }, el, 12 / zoom));
      const hitGroupArea = selectedGroup.length > 1 && groupBounds &&
        x >= groupBounds.minX && x <= groupBounds.maxX && y >= groupBounds.minY && y <= groupBounds.maxY;

      if (hitSelected || hitGroupArea) {
        setIsDraggingElement(true);
        isDraggingGroupRef.current = true;
        dragStartPointRef.current = { x, y };
        groupOriginalPositionsRef.current = selectedGroup.map(el => JSON.parse(JSON.stringify(el)));
        return;
      }

      const hit = [...elements].reverse().find(el => isPointHittingElement({ x, y }, el, 12 / zoom));
      if (hit) {
        if (e.shiftKey) {
          setSelectedElementIds(prev =>
            prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id]
          );
        } else {
          setSelectedElementIds([hit.id]);
          setIsDraggingElement(true);
          isDraggingGroupRef.current = false;
          dragStartPointRef.current = { x, y };
          elementOriginalPosRef.current = JSON.parse(JSON.stringify(hit));
        }
      } else {
        if (!e.shiftKey) {
          setSelectedElementIds([]);
        }
        // Clicar no espaço vazio no modo Seleção inicia uma caixa de seleção retangular
        isSelectingMarqueeRef.current = true;
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
      }
      return;
    }

    // Eraser Tool: hit-test and delete immediately
    if (activeTool === TOOLS.ERASER) {
      setIsDrawing(true);
      if (eraserMode === 'partial') {
        eraseSessionRef.current = {
          initial: elementsRef.current,
          initialIds: new Set(elementsRef.current.map((el) => el.id)),
          working: elementsRef.current
        };
        partialEraseAt(x, y);
        return;
      }
      const hit = [...elements].reverse().find(el => isPointHittingElement({ x, y }, el, 14 / zoom));
      if (hit) {
        setElements(prev => prev.filter(el => el.id !== hit.id));
        setUndoStack(prev => [...prev, { action: 'delete', element: hit }]);
        send('elements_delete', [hit.id]);
      }
      return;
    }

    // Text Tool: spawn text editor inline
    if (activeTool === TOOLS.TEXT) {
      // Sem isso o foco padrão do clique vai para o body e o onBlur do
      // textarea recém-criado fecha o editor na mesma hora.
      e.preventDefault();
      setEditingText({
        id,
        pageId,
        x,
        y,
        text: '',
        color,
        fontSize: Math.max(18, strokeWidth * 5),
        type: 'text'
      });
      return;
    }

    // Sticky Note Tool: create sticky note and start editing
    if (activeTool === TOOLS.STICKY) {
      setEditingText({
        id,
        pageId,
        x,
        y,
        text: '',
        bg: stickyColor.bg,
        border: stickyColor.border,
        textColor: stickyColor.text,
        type: 'sticky',
        width: 180,
        height: 180
      });
      return;
    }

    // LaTeX Tool: open the formula modal at the click position
    if (activeTool === TOOLS.LATEX) {
      // Mantém o foco no campo de código que o modal abre
      e.preventDefault();
      setLatexModal({ x, y, tex: '' });
      return;
    }

    // Drawing Tools
    setIsDrawing(true);
    let newElement = null;

    if (activeTool === TOOLS.PENCIL || activeTool === TOOLS.HIGHLIGHTER) {
      newElement = {
        id,
        pageId,
        type: activeTool,
        points: [{ x, y }],
        color,
        width: strokeWidth
      };
    } else if ([TOOLS.RECTANGLE, TOOLS.CIRCLE, TOOLS.LINE, TOOLS.ARROW].includes(activeTool)) {
      newElement = {
        id,
        pageId,
        type: activeTool,
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        color,
        width: strokeWidth,
        fill: fillShape ? (color + '22') : 'transparent'
      };
    }

    if (newElement) {
      setCurrentElement(newElement);
      socket.emit('element_preview', newElement);
      if (newElement.type === TOOLS.PENCIL || newElement.type === TOOLS.HIGHLIGHTER) {
        recordEvent('stroke_start', { id: newElement.id, tool: newElement.type, color: newElement.color, width: newElement.width, points: [{ x, y }] });
      } else {
        recordEvent('shape_start', { ...newElement, tool: newElement.type });
      }
    }
  };

  const handlePointerMove = (e) => {
    // Send cursor position to others (throttled to ~35ms)
    const now = Date.now();
    if (now - lastCursorSendRef.current > 35) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      socket.emit('cursor_move', coords);
      lastCursorSendRef.current = now;
    }

    // Panning
    if (lastPanPointRef.current) {
      const dx = e.clientX - lastPanPointRef.current.x;
      const dy = e.clientY - lastPanPointRef.current.y;
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);

    // Marquee selection active (caixa retangular de seleção)
    if (isSelectingMarqueeRef.current) {
      setSelectionBox(prev => prev ? ({ ...prev, endX: x, endY: y }) : null);
      return;
    }

    // Lasso selection active (seleção livre de região)
    if (isSelectingLassoRef.current) {
      setSelectionLasso(prev => prev ? [...prev, { x, y }] : [{ x, y }]);
      return;
    }

    // Dragging group of selected elements
    if (isDraggingElement && isDraggingGroupRef.current && dragStartPointRef.current && groupOriginalPositionsRef.current) {
      const dx = x - dragStartPointRef.current.x;
      const dy = y - dragStartPointRef.current.y;
      const origMap = new Map(groupOriginalPositionsRef.current.map(el => [el.id, el]));

      setElements(prev => prev.map(el => {
        const orig = origMap.get(el.id);
        if (!orig) return el;
        if (orig.type === 'pencil' || orig.type === 'highlighter') {
          return {
            ...el,
            points: orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
          };
        }
        if (orig.type === 'rectangle' || orig.type === 'circle' || orig.type === 'line' || orig.type === 'arrow') {
          return {
            ...el,
            startX: orig.startX + dx,
            startY: orig.startY + dy,
            endX: orig.endX + dx,
            endY: orig.endY + dy
          };
        }
        if (orig.type === 'text' || orig.type === 'sticky' || orig.type === 'image' || orig.type === 'latex') {
          return {
            ...el,
            x: orig.x + dx,
            y: orig.y + dy
          };
        }
        return el;
      }));
      return;
    }

    // Resizing selected element
    if (isResizingElement && resizeHandleRef.current && resizeOriginalElRef.current && selectedElementId) {
      const dx = x - resizeStartPointRef.current.x;
      const dy = y - resizeStartPointRef.current.y;
      const orig = resizeOriginalElRef.current;
      const handle = resizeHandleRef.current;

      setElements(prev => prev.map(el => {
        if (el.id !== selectedElementId) return el;
        if (el.type === 'image' || el.type === 'latex') {
          const ratio = (orig.width || 100) / (orig.height || 100);
          let newW, newH, newX = orig.x, newY = orig.y;

          if (handle === 'se') {
            newW = Math.max(30, Math.round(orig.width + dx));
            newH = Math.max(30, Math.round(newW / ratio));
          } else if (handle === 'sw') {
            newW = Math.max(30, Math.round(orig.width - dx));
            newH = Math.max(30, Math.round(newW / ratio));
            newX = orig.x + (orig.width - newW);
          } else if (handle === 'ne') {
            newW = Math.max(30, Math.round(orig.width + dx));
            newH = Math.max(30, Math.round(newW / ratio));
            newY = orig.y + (orig.height - newH);
          } else if (handle === 'nw') {
            newW = Math.max(30, Math.round(orig.width - dx));
            newH = Math.max(30, Math.round(newW / ratio));
            newX = orig.x + (orig.width - newW);
            newY = orig.y + (orig.height - newH);
          }

          return { ...el, x: newX, y: newY, width: newW, height: newH };
        }

        if (el.type === 'rectangle') {
          if (handle === 'se') return { ...el, endX: orig.endX + dx, endY: orig.endY + dy };
          if (handle === 'sw') return { ...el, startX: orig.startX + dx, endY: orig.endY + dy };
          if (handle === 'ne') return { ...el, endX: orig.endX + dx, startY: orig.startY + dy };
          if (handle === 'nw') return { ...el, startX: orig.startX + dx, startY: orig.startY + dy };
        }

        return el;
      }));
      return;
    }

    // Hover handle detection for cursor
    if (activeTool === TOOLS.SELECT && selectedElementId && !isDraggingElement && !isDrawing) {
      const selectedEl = elements.find(el => el.id === selectedElementId);
      const hHandle = getResizeHandle(selectedEl, { x, y }, zoom);
      if (hHandle !== hoverHandle) {
        setHoverHandle(hHandle);
      }
    } else if (hoverHandle) {
      setHoverHandle(null);
    }

    // Dragging selected element
    if (isDraggingElement && selectedElementId && dragStartPointRef.current && elementOriginalPosRef.current) {
      const dx = x - dragStartPointRef.current.x;
      const dy = y - dragStartPointRef.current.y;
      const orig = elementOriginalPosRef.current;

      setElements(prev => prev.map(el => {
        if (el.id !== selectedElementId) return el;
        if (el.type === 'pencil' || el.type === 'highlighter') {
          return {
            ...el,
            points: orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
          };
        }
        if (el.type === 'rectangle' || el.type === 'circle' || el.type === 'line' || el.type === 'arrow') {
          return {
            ...el,
            startX: orig.startX + dx,
            startY: orig.startY + dy,
            endX: orig.endX + dx,
            endY: orig.endY + dy
          };
        }
        if (el.type === 'text' || el.type === 'sticky' || el.type === 'image' || el.type === 'latex') {
          return {
            ...el,
            x: orig.x + dx,
            y: orig.y + dy
          };
        }
        return el;
      }));
      return;
    }

    // Continuous Eraser while dragging
    if (isDrawing && activeTool === TOOLS.ERASER) {
      if (e.buttons === 0) {
        setIsDrawing(false);
        commitEraseSession();
        return;
      }
      if (eraserMode === 'partial') {
        partialEraseAt(x, y);
        return;
      }
      const hit = [...elements].reverse().find(el => isPointHittingElement({ x, y }, el, 14 / zoom));
      if (hit) {
        setElements(prev => prev.filter(el => el.id !== hit.id));
        setUndoStack(prev => [...prev, { action: 'delete', element: hit }]);
        send('elements_delete', [hit.id]);
        recordEvent('elements_delete', { elementIds: [hit.id] });
      }
      return;
    }

    // Updating active drawing element
    if (!isDrawing || !currentElement) return;

    if (currentElement.type === TOOLS.PENCIL || currentElement.type === TOOLS.HIGHLIGHTER) {
      const updated = {
        ...currentElement,
        points: [...currentElement.points, { x, y }]
      };
      setCurrentElement(updated);
      socket.emit('element_preview', updated);
      recordEvent('stroke_point', { id: currentElement.id, point: { x, y } });
    } else if ([TOOLS.RECTANGLE, TOOLS.CIRCLE, TOOLS.LINE, TOOLS.ARROW].includes(currentElement.type)) {
      const updated = {
        ...currentElement,
        endX: x,
        endY: y
      };
      setCurrentElement(updated);
      socket.emit('element_preview', updated);
      recordEvent('shape_update', { id: currentElement.id, endX: x, endY: y });
    }
  };

  const handlePointerUp = () => {
    // End panning
    if (lastPanPointRef.current) {
      lastPanPointRef.current = null;
    }

    // End marquee box selection
    if (isSelectingMarqueeRef.current) {
      isSelectingMarqueeRef.current = false;
      if (selectionBox) {
        const minX = Math.min(selectionBox.startX, selectionBox.endX);
        const maxX = Math.max(selectionBox.startX, selectionBox.endX);
        const minY = Math.min(selectionBox.startY, selectionBox.endY);
        const maxY = Math.max(selectionBox.startY, selectionBox.endY);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w > 4 || h > 4) {
          const rect = { minX, minY, maxX, maxY };
          const matched = elements.filter(el => isElementInRect(el, rect)).map(el => el.id);
          setSelectedElementIds(matched);
          if (matched.length > 0 && activeTool === TOOLS.SELECT_RECT) {
            setActiveTool(TOOLS.SELECT);
          }
        }
        setSelectionBox(null);
      }
      return;
    }

    // End lasso region selection
    if (isSelectingLassoRef.current) {
      isSelectingLassoRef.current = false;
      if (selectionLasso && selectionLasso.length >= 3) {
        const matched = elements.filter(el => isElementInPolygon(el, selectionLasso)).map(el => el.id);
        setSelectedElementIds(matched);
        if (matched.length > 0 && activeTool === TOOLS.SELECT_LASSO) {
          setActiveTool(TOOLS.SELECT);
        }
      }
      setSelectionLasso(null);
      return;
    }

    // End dragging group of selected elements
    if (isDraggingElement && isDraggingGroupRef.current) {
      setIsDraggingElement(false);
      isDraggingGroupRef.current = false;
      dragStartPointRef.current = null;
      const origs = groupOriginalPositionsRef.current;
      groupOriginalPositionsRef.current = null;
      if (origs && origs.length > 0) {
        const currentMoved = elements.filter(el => origs.some(o => o.id === el.id));
        setUndoStack(prev => [...prev, { action: 'batch_update', previous: origs, current: currentMoved }]);
        setRedoStack([]);
        currentMoved.forEach(el => send('element_update', el));
      }
      return;
    }

    // End resizing element and emit update
    if (isResizingElement && selectedElementId) {
      setIsResizingElement(false);
      resizeHandleRef.current = null;
      const orig = resizeOriginalElRef.current;
      resizeOriginalElRef.current = null;
      resizeStartPointRef.current = null;
      const updated = elements.find(el => el.id === selectedElementId);
      if (updated) {
        setUndoStack(prev => [...prev, { action: 'update', previous: orig, current: updated }]);
        setRedoStack([]);
        send('element_update', updated);
      }
      return;
    }

    // End dragging element and emit update
    if (isDraggingElement && selectedElementId) {
      setIsDraggingElement(false);
      dragStartPointRef.current = null;
      elementOriginalPosRef.current = null;
      const updated = elements.find(el => el.id === selectedElementId);
      if (updated) {
        send('element_update', updated);
      }
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    commitEraseSession();

    if (currentElement) {
      // Validate element (discard tiny clicks)
      let isValid = true;
      if (currentElement.type === 'pencil' || currentElement.type === 'highlighter') {
        isValid = currentElement.points.length > 0;
      } else if (currentElement.startX !== undefined) {
        const dist = Math.hypot(
          currentElement.endX - currentElement.startX,
          currentElement.endY - currentElement.startY
        );
        isValid = dist > 3;
      }

      if (isValid) {
        addElement(currentElement);
      } else {
        // Remove o preview fantasma que ficou no outro cliente
        socket.emit('element_preview', null);
      }
      setCurrentElement(null);
    }
  };

  // Zoom with mouse wheel
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(3, Math.max(0.2, +(zoom * zoomFactor).toFixed(2)));

    // Zoom centered around current mouse position
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const newPanX = mouseX - (mouseX - panOffset.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - panOffset.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  };

  // Reset Zoom & Pan to default
  const handleResetZoomAndPan = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Undo / Redo handlers
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));

    if (lastAction.action === 'create') {
      const elId = lastAction.element.id;
      setElements(prev => prev.filter(el => el.id !== elId));
      setRedoStack(prev => [...prev, lastAction]);
      send('elements_delete', [elId]);
    } else if (lastAction.action === 'delete') {
      setElements(prev => [...prev, lastAction.element]);
      setRedoStack(prev => [...prev, lastAction]);
      send('element_create', lastAction.element);
    } else if (lastAction.action === 'update') {
      setElements(prev => prev.map(el => (el.id === lastAction.previous.id ? lastAction.previous : el)));
      setRedoStack(prev => [...prev, lastAction]);
      send('element_update', lastAction.previous);
    } else if (lastAction.action === 'erase') {
      const addedIds = new Set(lastAction.added.map(el => el.id));
      setElements(prev => [...prev.filter(el => !addedIds.has(el.id)), ...lastAction.removed]);
      lastAction.removed.forEach(el => send('element_create', el));
      if (addedIds.size) send('elements_delete', [...addedIds]);
      setRedoStack(prev => [...prev, lastAction]);
    } else if (lastAction.action === 'batch_create') {
      const ids = lastAction.elements.map(el => el.id);
      const idSet = new Set(ids);
      setElements(prev => prev.filter(el => !idSet.has(el.id)));
      setRedoStack(prev => [...prev, lastAction]);
      send('elements_delete', ids);
      setSelectedElementIds([]);
    } else if (lastAction.action === 'batch_delete') {
      setElements(prev => [...prev, ...lastAction.elements]);
      setRedoStack(prev => [...prev, lastAction]);
      lastAction.elements.forEach(el => send('element_create', el));
      setSelectedElementIds(lastAction.elements.map(el => el.id));
    } else if (lastAction.action === 'batch_update') {
      const map = new Map(lastAction.previous.map(el => [el.id, el]));
      setElements(prev => prev.map(el => map.get(el.id) || el));
      setRedoStack(prev => [...prev, lastAction]);
      lastAction.previous.forEach(el => send('element_update', el));
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextAction = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    if (nextAction.action === 'create') {
      setElements(prev => [...prev, nextAction.element]);
      setUndoStack(prev => [...prev, nextAction]);
      send('element_create', nextAction.element);
    } else if (nextAction.action === 'delete') {
      const elId = nextAction.element.id;
      setElements(prev => prev.filter(el => el.id !== elId));
      setUndoStack(prev => [...prev, nextAction]);
      send('elements_delete', [elId]);
    } else if (nextAction.action === 'update') {
      setElements(prev => prev.map(el => (el.id === nextAction.current.id ? nextAction.current : el)));
      setUndoStack(prev => [...prev, nextAction]);
      send('element_update', nextAction.current);
    } else if (nextAction.action === 'erase') {
      const removedIds = new Set(nextAction.removed.map(el => el.id));
      setElements(prev => [...prev.filter(el => !removedIds.has(el.id)), ...nextAction.added]);
      nextAction.added.forEach(el => send('element_create', el));
      if (removedIds.size) send('elements_delete', [...removedIds]);
      setUndoStack(prev => [...prev, nextAction]);
    } else if (nextAction.action === 'batch_create') {
      setElements(prev => [...prev, ...nextAction.elements]);
      setUndoStack(prev => [...prev, nextAction]);
      nextAction.elements.forEach(el => send('element_create', el));
      setSelectedElementIds(nextAction.elements.map(el => el.id));
    } else if (nextAction.action === 'batch_delete') {
      const ids = nextAction.elements.map(el => el.id);
      const idSet = new Set(ids);
      setElements(prev => prev.filter(el => !idSet.has(el.id)));
      setUndoStack(prev => [...prev, nextAction]);
      send('elements_delete', ids);
      setSelectedElementIds([]);
    } else if (nextAction.action === 'batch_update') {
      const map = new Map(nextAction.current.map(el => [el.id, el]));
      setElements(prev => prev.map(el => map.get(el.id) || el));
      setUndoStack(prev => [...prev, nextAction]);
      nextAction.current.forEach(el => send('element_update', el));
    }
  };

  // Clear Canvas
  const handleClearCanvas = () => {
    if (elements.length === 0) return;
    if (window.confirm('Tem certeza que deseja limpar a página atual para todos na sala?')) {
      setElements([]);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElementId(null);
      send('canvas_clear');
      recordEvent('clear', {});
    }
  };

  // Prepare offscreen canvas for exporting
  const prepareExportCanvas = async () => {
    if (elements.length === 0) {
      throw new Error('A página está vazia! Desenhe algo antes de exportar.');
    }

    // Garante que fotos e fórmulas já estejam carregadas antes de rasterizar
    const imageSources = elements
      .filter(el => el.type === 'image' || el.type === 'latex')
      .map(el => (el.type === 'latex' ? el.svg : el.src))
      .filter(Boolean);
    await Promise.all(imageSources.map(src => loadImage(src).catch(() => null)));

    // Determine bounding box of all elements
    const measureCtx = document.createElement('canvas').getContext('2d');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
      if (el.points && el.points.length > 0) {
        el.points.forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
      } else if (el.startX !== undefined && el.endX !== undefined) {
        minX = Math.min(minX, el.startX, el.endX);
        minY = Math.min(minY, el.startY, el.endY);
        maxX = Math.max(maxX, el.startX, el.endX);
        maxY = Math.max(maxY, el.startY, el.endY);
      } else if (el.type === 'text') {
        const fontSize = el.fontSize || 20;
        measureCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const lines = (el.text || '').split('\n');
        const width = Math.max(...lines.map(line => measureCtx.measureText(line).width), 50);
        const height = lines.length * fontSize * 1.3;
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + width);
        maxY = Math.max(maxY, el.y + height);
      } else if (el.x !== undefined) {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + (el.width || 200));
        maxY = Math.max(maxY, el.y + (el.height || 200));
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
    }

    const padding = 50;
    const exportWidth = Math.max(400, Math.ceil(maxX - minX + padding * 2));
    const exportHeight = Math.max(400, Math.ceil(maxY - minY + padding * 2));

    const offscreen = document.createElement('canvas');
    offscreen.width = exportWidth * 2;
    offscreen.height = exportHeight * 2;
    const offCtx = offscreen.getContext('2d');
    offCtx.scale(2, 2);

    // Page background
    offCtx.fillStyle = bg.color || '#ffffff';
    offCtx.fillRect(0, 0, exportWidth, exportHeight);

    // Draw elements translated to origin
    offCtx.translate(-minX + padding, -minY + padding);
    elements.forEach(el => renderElement(offCtx, el));

    return { offscreen, exportWidth, exportHeight };
  };

  // Export to PNG Image
  const handleExportPNG = async () => {
    try {
      const { offscreen } = await prepareExportCanvas();
      const dataUrl = offscreen.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const pageIndex = pages.findIndex(p => p.id === activePageId);
      const pageNum = pageIndex !== -1 ? `-p${pageIndex + 1}` : '';
      a.download = `whiteboard-${roomId || 'quadro'}${pageNum}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    } catch (err) {
      alert(err.message || 'Erro ao exportar PNG.');
    }
  };

  // Export to PDF Document
  const handleExportPDF = async () => {
    try {
      const { offscreen, exportWidth, exportHeight } = await prepareExportCanvas();
      const imgData = offscreen.toDataURL('image/png');
      const { jsPDF } = await import('jspdf');
      const orientation = exportWidth >= exportHeight ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [exportWidth, exportHeight]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, exportWidth, exportHeight);
      const pageIndex = pages.findIndex(p => p.id === activePageId);
      const pageNum = pageIndex !== -1 ? `pagina-${pageIndex + 1}` : 'pagina';
      pdf.save(`whiteboard-${roomId || 'quadro'}-${pageNum}.pdf`);
    } catch (err) {
      alert(err.message || 'Erro ao exportar PDF.');
    }
  };

  // Export Room Project as JSON
  const handleExportJSON = () => {
    try {
      const roomData = {
        version: 1,
        activePageId,
        pages: pages.map(p => {
          if (p.id === activePageId) {
            return { ...p, elements };
          }
          return p;
        }),
        updatedAt: new Date().toISOString()
      };
      const jsonStr = JSON.stringify(roomData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${roomId || 'whiteboard'}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert('Erro ao exportar JSON: ' + err.message);
    }
  };

  // Keyboard Shortcuts (Space, Undo, Redo, Tool keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is currently typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.code === 'Space' && !isSpacePressed) {
        e.preventDefault();
        setIsSpacePressed(true);
        setPrevTool(activeTool);
        setActiveTool(TOOLS.HAND);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          duplicateSelected();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
      } else {
        // Tool shortcuts
        const key = e.key.toLowerCase();
        if (key === 'v') setActiveTool(TOOLS.SELECT);
        else if (key === 'b') setActiveTool(TOOLS.SELECT_RECT);
        else if (key === 'q') setActiveTool(TOOLS.SELECT_LASSO);
        else if (key === 'h') setActiveTool(TOOLS.HAND);
        else if (key === 'p') setActiveTool(TOOLS.PENCIL);
        else if (key === 'm') setActiveTool(TOOLS.HIGHLIGHTER);
        else if (key === 'e') setActiveTool(TOOLS.ERASER);
        else if (key === 'r') setActiveTool(TOOLS.RECTANGLE);
        else if (key === 'c') setActiveTool(TOOLS.CIRCLE);
        else if (key === 'l') setActiveTool(TOOLS.LINE);
        else if (key === 'a') setActiveTool(TOOLS.ARROW);
        else if (key === 't') setActiveTool(TOOLS.TEXT);
        else if (key === 's') setActiveTool(TOOLS.STICKY);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setActiveTool(prevTool);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, prevTool, isSpacePressed, selectedElementId, elements, undoStack, redoStack]);

  // Finish text/sticky editing
  const commitEditingText = () => {
    if (!editingText) return;
    if (editingText.text.trim()) {
      addElement({ ...editingText });
    }
    setEditingText(null);
  };
  useEffect(() => {
    roomIdRef.current = roomId;
    userRef.current = currentUser;
    activePageIdRef.current = activePageId;
    currentElementRef.current = currentElement;
    editingTextRef.current = editingText;
    commitEditingRef.current = commitEditingText;
    isDraggingElementRef.current = isDraggingElement;
    selectedElementIdRef.current = selectedElementId;
    elementsRef.current = elements;
  });

  // Insert or update a LaTeX formula
  const handleLatexInsert = ({ tex, dataUrl, width, height }) => {
    if (!latexModal) return;

    if (latexModal.id) {
      const current = elements.find(el => el.id === latexModal.id);
      if (current) {
        const updated = { ...current, tex, svg: dataUrl, width, height };
        setElements(prev => prev.map(el => (el.id === updated.id ? updated : el)));
        send('element_update', updated);
      }
    } else {
      addElement({
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'latex',
        pageId: activePageIdRef.current,
        x: latexModal.x,
        y: latexModal.y,
        tex,
        svg: dataUrl,
        width,
        height
      });
    }
    setLatexModal(null);
  };

  const handleDoubleClick = (e) => {
    if (activeTool !== TOOLS.SELECT) return;
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    const hit = [...elements].reverse().find(el => isPointHittingElement({ x, y }, el, 12 / zoom));
    if (hit?.type === 'latex') {
      setLatexModal({ x: hit.x, y: hit.y, tex: hit.tex, id: hit.id });
    }
  };

  // Upload and insert an image onto the canvas
  const uploadAndInsertImage = useCallback(async (file) => {
    if (!file || !roomId) return;
    try {
      const response = await fetch(`/api/upload?room=${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Falha ao enviar a imagem.');

      const image = await loadImage(data.url);
      const maxWidth = 480;
      const maxHeight = 360;
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      const width = Math.round(image.naturalWidth * scale);
      const height = Math.round(image.naturalHeight * scale);
      const center = getCanvasCoords(window.innerWidth / 2, (window.innerHeight + 64) / 2);

      const newEl = {
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'image',
        pageId: activePageIdRef.current,
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
        width,
        height,
        src: data.url
      };
      addElement(newEl);
      setSelectedElementId(newEl.id);
      setActiveTool(TOOLS.SELECT);
    } catch (err) {
      alert(err.message);
    }
  }, [roomId, addElement, getCanvasCoords]);

  // Ctrl+V: cola imagem da área de transferência
  useEffect(() => {
    const onPaste = async (event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const item = items.find(it => it.type.startsWith('image/'));
      const file = item?.getAsFile() ||
        Array.from(event.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      uploadAndInsertImage(file);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [uploadAndInsertImage]);

  // Scale selected element (Diminuir ou Aumentar)
  const scaleSelectedElement = (factor) => {
    const el = elements.find(item => item.id === selectedElementId);
    if (!el || (!el.width && !el.height)) return;
    const oldEl = JSON.parse(JSON.stringify(el));
    const newW = Math.max(30, Math.round(el.width * factor));
    const newH = Math.max(30, Math.round(el.height * factor));
    const dx = (newW - el.width) / 2;
    const dy = (newH - el.height) / 2;
    const updated = {
      ...el,
      x: Math.round(el.x - dx),
      y: Math.round(el.y - dy),
      width: newW,
      height: newH
    };
    setElements(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    setUndoStack(prev => [...prev, { action: 'update', previous: oldEl, current: updated }]);
    setRedoStack([]);
    send('element_update', updated);
  };

  // Duplicar elementos selecionados (grupo ou único)
  const duplicateSelected = () => {
    if (selectedElementIds.length === 0) return;
    const toDuplicate = elements.filter(el => selectedElementIds.includes(el.id));
    if (toDuplicate.length === 0) return;

    const dx = 25;
    const dy = 25;
    const newElements = toDuplicate.map(el => {
      const newId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      if (el.type === 'pencil' || el.type === 'highlighter') {
        return { ...el, id: newId, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      }
      if (el.type === 'rectangle' || el.type === 'circle' || el.type === 'line' || el.type === 'arrow') {
        return {
          ...el,
          id: newId,
          startX: el.startX + dx,
          startY: el.startY + dy,
          endX: el.endX + dx,
          endY: el.endY + dy
        };
      }
      if (el.type === 'text' || el.type === 'sticky' || el.type === 'image' || el.type === 'latex') {
        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
      }
      return { ...el, id: newId };
    });

    setElements(prev => [...prev, ...newElements]);
    setUndoStack(prev => [...prev, { action: 'batch_create', elements: newElements }]);
    setRedoStack([]);
    newElements.forEach(el => send('element_create', el));
    recordEvent('batch_add', { elements: newElements });
    setSelectedElementIds(newElements.map(el => el.id));
  };

  // Excluir elementos selecionados (grupo ou único)
  const deleteSelected = () => {
    if (selectedElementIds.length === 0) return;
    const toDelete = elements.filter(el => selectedElementIds.includes(el.id));
    if (toDelete.length === 0) return;

    setElements(prev => prev.filter(el => !selectedElementIds.includes(el.id)));
    setUndoStack(prev => [...prev, { action: 'batch_delete', elements: toDelete }]);
    setRedoStack([]);
    send('elements_delete', selectedElementIds);
    recordEvent('elements_delete', { elementIds: [...selectedElementIds] });
    setSelectedElementIds([]);
  };

  const deleteSelectedElement = () => {
    deleteSelected();
  };

  const handleSave = () => {
    setSaveStatus('Salvando...');
    send('save_flush');
  };

  const handleAddPage = () => send('page_add');

  const handleRemovePage = () => {
    if (pages.length <= 1) {
      if (window.confirm('Esta é a única página do quadro. Deseja limpar todos os desenhos dela?')) {
        handleClearCanvas();
      }
      return;
    }
    const pageIndex = pages.findIndex(p => p.id === activePageId);
    const pageNum = pageIndex !== -1 ? pageIndex + 1 : '';
    if (window.confirm(`Tem certeza que deseja remover a Página ${pageNum}? O conteúdo desta página será apagado para todos na sala.`)) {
      send('page_delete', { pageId: activePageId });
    }
  };

  const handleSelectPage = (pageId) => {
    if (pageId !== activePageIdRef.current) send('page_switch', { pageId });
  };

  const handleChangeBg = (partial) => {
    const pageId = activePageIdRef.current;
    if (!pageId) return;
    const merged = { ...bg, ...partial };
    setPages(prev => prev.map(page => (page.id === pageId ? { ...page, bg: merged } : page)));
    send('page_bg_update', { pageId, bg: merged });
  };

  // Cursor style based on active tool
  const getCanvasCursorStyle = () => {
    if (isSpacePressed || activeTool === TOOLS.HAND) return 'grab';
    if (hoverHandle === 'nw' || hoverHandle === 'se') return 'nwse-resize';
    if (hoverHandle === 'ne' || hoverHandle === 'sw') return 'nesw-resize';
    if (activeTool === TOOLS.SELECT_RECT) return 'crosshair';
    if (activeTool === TOOLS.SELECT_LASSO) return 'crosshair';
    if (activeTool === TOOLS.SELECT) return 'default';
    if (activeTool === TOOLS.ERASER) return 'cell';
    if (activeTool === TOOLS.TEXT) return 'text';
    return 'crosshair';
  };

  return (
    <div
      style={{ backgroundColor: bg.color }}
      className={`relative w-full h-full overflow-hidden select-none ${
        bg.grid === 'dots' ? 'canvas-grid-dots' : bg.grid === 'lines' ? 'canvas-grid-lines' : ''
      }`}
    >
      {/* Top Header Bar */}
      <Header
        roomId={roomId}
        onRenameRoom={handleRenameRoom}
        users={users}
        currentUser={currentUser}
        onOpenUserModal={() => setIsUserModalOpen(true)}
        onOpenProjectsModal={() => setIsProjectsModalOpen(true)}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onOpenTimelapse={handleOpenTimelapse}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onClearCanvas={handleClearCanvas}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
        onExportJSON={handleExportJSON}
        bg={bg}
        onChangeBg={handleChangeBg}
        onSave={handleSave}
        saveStatus={saveStatus}
      />

      {/* Main Interactive Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{ cursor: getCanvasCursorStyle() }}
        className="absolute inset-0 touch-none block"
      />

      {/* Real-time collaborative remote cursors */}
      <RemoteCursors
        cursors={remoteCursors}
        zoom={zoom}
        panOffset={panOffset}
        currentUserId={currentUser?.id}
      />

      {/* Floating Bottom Toolbar */}
      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        color={color}
        setColor={setColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        fillShape={fillShape}
        setFillShape={setFillShape}
        stickyColor={stickyColor}
        setStickyColor={setStickyColor}
        eraserMode={eraserMode}
        setEraserMode={setEraserMode}
        onUploadImage={uploadAndInsertImage}
      />

      {/* Page switcher */}
      <PageBar
        pages={pages}
        activePageId={activePageId}
        onSelect={handleSelectPage}
        onAdd={handleAddPage}
        onRemove={handleRemovePage}
      />

      {/* Zoom and pan controls */}
      <ZoomControls
        zoom={zoom}
        setZoom={setZoom}
        resetZoomAndPan={handleResetZoomAndPan}
      />

      {/* Quick Action Pill for Selected Image / LaTeX (Diminuir, Aumentar, Excluir) */}
      {(() => {
        if (!selectedElementId) return null;
        const selEl = elements.find(el => el.id === selectedElementId);
        if (!selEl || !['image', 'latex'].includes(selEl.type)) return null;

        const screenX = (selEl.x + (selEl.width || 100) / 2) * zoom + panOffset.x;
        const screenY = (selEl.y + (selEl.height || 40)) * zoom + panOffset.y + 12;

        return (
          <div
            style={{
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: 'translateX(-50%)'
            }}
            className="fixed z-40 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-xl border border-slate-200 text-xs font-semibold text-slate-700 animate-in fade-in duration-100"
          >
            <button
              onClick={() => scaleSelectedElement(0.8)}
              title="Diminuir imagem (-20%)"
              className="p-1 rounded-lg hover:bg-slate-100 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ZoomOut size={14} className="text-blue-600" />
              <span>Diminuir</span>
            </button>
            <div className="h-3 w-px bg-slate-200" />
            <button
              onClick={() => scaleSelectedElement(1.25)}
              title="Aumentar imagem (+25%)"
              className="p-1 rounded-lg hover:bg-slate-100 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ZoomIn size={14} className="text-blue-600" />
              <span>Aumentar</span>
            </button>
            <div className="h-3 w-px bg-slate-200" />
            <button
              onClick={deleteSelectedElement}
              title="Excluir imagem"
              className="p-1 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })()}

      {/* Group Action Pill for Multiple Selected Elements */}
      {(() => {
        if (selectedElementIds.length <= 1) return null;
        const selectedEls = elements.filter(el => selectedElementIds.includes(el.id));
        const bounds = getGroupBounds(selectedEls);
        if (!bounds) return null;

        const screenX = ((bounds.minX + bounds.maxX) / 2) * zoom + panOffset.x;
        const screenY = bounds.maxY * zoom + panOffset.y + 14;

        return (
          <div
            style={{
              left: `${Math.max(130, Math.min(window.innerWidth - 130, screenX))}px`,
              top: `${Math.min(window.innerHeight - 80, screenY)}px`,
              transform: 'translateX(-50%)'
            }}
            className="fixed z-40 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-xl border border-slate-200 text-xs font-semibold text-slate-700 animate-in fade-in duration-100 select-none"
          >
            <div className="flex items-center gap-1.5 text-blue-600 font-bold border-r border-slate-200 pr-2">
              <CheckSquare size={15} />
              <span>{selectedElementIds.length} selecionados</span>
            </div>
            <button
              onClick={duplicateSelected}
              title="Duplicar elementos selecionados (Ctrl+D)"
              className="p-1 px-2 rounded-lg hover:bg-slate-100 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Copy size={13} className="text-slate-600" />
              <span>Duplicar</span>
            </button>
            <div className="h-3 w-px bg-slate-200" />
            <button
              onClick={deleteSelected}
              title="Excluir elementos selecionados (Delete)"
              className="p-1 px-2 rounded-lg hover:bg-red-50 text-red-600 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 size={13} />
              <span>Excluir</span>
            </button>
          </div>
        );
      })()}

      {/* Inline Text / Sticky note editor overlay */}
      {editingText && (
        <div
          style={{
            left: `${Math.min(editingText.x * zoom + panOffset.x, Math.max(0, window.innerWidth - 220))}px`,
            top: `${Math.min(editingText.y * zoom + panOffset.y, Math.max(0, window.innerHeight - 120))}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left'
          }}
          className="absolute z-40"
        >
          {editingText.type === 'text' ? (
            <textarea
              autoFocus
              value={editingText.text}
              onChange={(e) => setEditingText(prev => ({ ...prev, text: e.target.value }))}
              onBlur={commitEditingText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitEditingText();
                }
              }}
              placeholder="Digite o texto aqui..."
              style={{
                color: editingText.color,
                fontSize: `${editingText.fontSize}px`,
                lineHeight: 1.3
              }}
              className="bg-transparent border border-blue-400 rounded-md p-1 outline-none resize-none min-w-[200px] min-h-[40px] font-sans shadow-xs"
            />
          ) : (
            <div
              style={{
                backgroundColor: editingText.bg,
                borderColor: editingText.border,
                width: `${editingText.width}px`,
                height: `${editingText.height}px`
              }}
              className="rounded-xl border-2 p-3 shadow-xl flex flex-col justify-between"
            >
              <textarea
                autoFocus
                value={editingText.text}
                onChange={(e) => setEditingText(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Escreva sua anotação..."
                style={{ color: editingText.textColor }}
                className="w-full h-full bg-transparent border-none outline-none resize-none font-medium text-sm"
              />
              <div className="flex justify-end pt-1">
                <button
                  onClick={commitEditingText}
                  className="px-2 py-0.5 rounded bg-black/10 hover:bg-black/20 text-xs font-bold cursor-pointer transition-colors"
                >
                  Pronto
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LaTeX formula modal */}
      {latexModal && (
        <LatexModal
          initialTex={latexModal.tex}
          onInsert={handleLatexInsert}
          onClose={() => setLatexModal(null)}
        />
      )}

      {/* User profile modal */}
      <UserNameModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        currentUser={currentUser}
        onSave={handleSaveProfile}
      />

      {/* Projects modal (C:\Users\Giovanni Brendo\Downloads\WhiteBoard\rooms) */}
      <ProjectsModal
        isOpen={isProjectsModalOpen}
        onClose={() => setIsProjectsModalOpen(false)}
        currentRoomId={roomId}
        onSwitchRoom={(newRoom) => {
          window.location.href = `${window.location.pathname}?room=${encodeURIComponent(newRoom)}`;
        }}
      />

      {/* Timelapse modal */}
      <TimelapseModal
        isOpen={isTimelapseModalOpen}
        onClose={() => setIsTimelapseModalOpen(false)}
        data={timelapseData}
        roomId={roomId}
      />
    </div>
  );
}
