// 1. Captura de elementos del DOM

const NEXT_ENDPOINT = window.NEXT_ENDPOINT;
let currentMediaId = null;


const imgElement = document.getElementById('web-image');
const videoElement = document.getElementById('web-video');
const progressFill = document.getElementById('progress-fill');
const timeLeft = document.getElementById('time-left');
const timeRight = document.getElementById('time-right');

const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
const iconFsMaximize = document.getElementById('icon-fs-maximize');
const iconFsMinimize = document.getElementById('icon-fs-minimize');

const btnVolumeToggle = document.getElementById('btn-volume-toggle');
const volumeSlider = document.getElementById('volume-slider');
const iconVolUp = document.getElementById('icon-vol-up');
const iconVolMute = document.getElementById('icon-vol-mute');

// Botones Inferiores
const btnAuto = document.getElementById('btn-web-auto');
const btnLoop = document.getElementById('btn-web-loop');

// Botones del Overlay Flotante
const overlayToggle = document.getElementById('overlay-toggle');
const overlayBack15 = document.getElementById('overlay-back-15');
const overlayForward15 = document.getElementById('overlay-forward-15');
const overlayPrev = document.getElementById('overlay-prev');
const overlayNext = document.getElementById('overlay-next-btn');
const fileCounter = document.getElementById('file-counter');
const overlayRestart = document.getElementById('overlay-restart')

// Iconos del botón central
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

// 2. Variables de Estado
let currentMedia = null;
let autoAdvance = true;
let isPaused = false;

// Tiempos para imágenes
let imageTimer = null;
let imageProgressInterval = null;
let imageElapsed = 0;
const IMAGE_DURATION = 5000; // 5 segundos

let lastVolume = 0.8;

// 3. Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadNextMedia();
    setupEventListeners();
});

function setupEventListeners() {
    // Controles flotantes (con protección por si acaso)
    if (overlayToggle) overlayToggle.addEventListener('click', togglePlayPause);
    if (overlayNext) overlayNext.addEventListener('click', loadNextMedia);
    if (overlayRestart) overlayRestart.addEventListener('click', handleRestart);
    if (overlayBack15) overlayBack15.addEventListener('click', () => skipTime(-15));
    if (overlayForward15) overlayForward15.addEventListener('click', () => skipTime(15));
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);

    // Controles inferiores
    if (btnAuto) btnAuto.addEventListener('click', toggleAutoAdvance);
    if (btnLoop) btnLoop.addEventListener('click', toggleLoop);

    if (btnFullscreenToggle) {
        btnFullscreenToggle.addEventListener('click', () => {
            // Buscamos el contenedor máster para meter toda la interfaz a pantalla completa
            const container = document.documentElement;

            if (!document.fullscreenElement) {
                // Si no está en full-screen, entra
                container.requestFullscreen().catch(err => {
                    console.error(`Error al intentar activar Fullscreen: ${err.message}`);
                });
            } else {
                // Si ya está, sale
                document.exitFullscreen();
            }
        });

        // Escuchamos el cambio de estado nativo del navegador para cambiar el SVG
        // Esto cubre si el usuario sale pulsando la tecla 'Esc'
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                // Estamos en pantalla completa: mostramos icono de contraer
                if (iconFsMaximize) iconFsMaximize.style.display = 'none';
                if (iconFsMinimize) iconFsMinimize.style.setProperty('display', 'block', 'important');
            } else {
                // Salimos de pantalla completa: mostramos icono de expandir
                if (iconFsMaximize) iconFsMaximize.style.setProperty('display', 'block', 'important');
                if (iconFsMinimize) iconFsMinimize.style.display = 'none';
            }
        });
    }

    if (btnVolumeToggle && volumeSlider) {
        // Sincronizar volumen inicial del vídeo con el slider de la interfaz
        videoElement.volume = volumeSlider.value;

        // Evento al arrastrar la barra de volumen
        volumeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            videoElement.volume = val;

            if (parseFloat(val) === 0) {
                updateVolumeIcons(true);
            } else {
                lastVolume = val;
                updateVolumeIcons(false);
            }
        });

        // Evento al hacer click directamente en el altavoz (Mute/Unmute)
        btnVolumeToggle.addEventListener('click', () => {
            if (videoElement.volume > 0) {
                // Mutear
                lastVolume = videoElement.volume;
                videoElement.volume = 0;
                volumeSlider.value = 0;
                updateVolumeIcons(true);
            } else {
                // Recuperar sonido anterior
                videoElement.volume = lastVolume;
                volumeSlider.value = lastVolume;
                updateVolumeIcons(false);
            }
        });
    }

    function updateVolumeIcons(isMuted) {
        if (!iconVolUp || !iconVolMute) return;
        if (isMuted) {
            iconVolUp.style.display = 'none';
            iconVolMute.style.setProperty('display', 'block', 'important');
        } else {
            iconVolUp.style.setProperty('display', 'block', 'important');
            iconVolMute.style.display = 'none';
        }
    }

    // Eventos del reproductor de vídeo nativo
    if (videoElement) {
        videoElement.addEventListener('timeupdate', updateVideoProgress);
        videoElement.addEventListener('ended', () => {
            if (!videoElement.loop) loadNextMedia();
        });
    }
}

// 4. Carga de Siguiente Archivo
async function loadNextMedia() {
    resetTimers();
    isPaused = false;
    updateOverlayIcons();

    imgElement.className = 'hidden';
    videoElement.className = 'hidden';
    videoElement.pause();
    videoElement.src = "";

    try {
        const response = await fetch(NEXT_ENDPOINT);
        currentMedia = await response.json();
        currentMediaId = currentMedia.id;

        if (currentMedia.error) {
            alert(currentMedia.error);
            return;
        }

        document.title = `🎞️ ${currentMedia.filename}`;
        if (fileCounter) fileCounter.textContent = `(${currentMedia.index} / ${currentMedia.total})`;

        // Bloquear o desbloquear botón de repetir abajo si es imagen
        if (btnLoop) {
            btnLoop.style.opacity = currentMedia.type === 'video' ? '1' : '0.3';
            btnLoop.style.pointerEvents = currentMedia.type === 'video' ? 'auto' : 'none';
        }

        if (currentMedia.type === 'image') {
            imgElement.src = currentMedia.url;
            imgElement.className = '';
            startImageSequence();
        } else {
            setupVideoControls();
            videoElement.src = currentMedia.url;
            videoElement.volume = document.getElementById('volume-slider') ? document.getElementById('volume-slider').value : 0.8;
            videoElement.className = '';
            videoElement.play();
        }
    } catch (err) {
        console.error("Error cargando multimedia:", err);
    }
}

// 5. Lógica Unión Play / Pausa
function togglePlayPause() {
    if (!currentMedia) return;

    isPaused = !isPaused;
    updateOverlayIcons();

    if (currentMedia.type === 'video') {
        if (isPaused) {
            videoElement.pause();
        } else {
            videoElement.play();
        }
    } else if (currentMedia.type === 'image' && autoAdvance) {
        if (isPaused) {
            clearInterval(imageProgressInterval);
            clearTimeout(imageTimer);
        } else {
            resumeImageSequence();
        }
    }
}

function updateOverlayIcons() {
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');

    if (!iconPause || !iconPlay) return;

    if (isPaused) {
        // Si está en PAUSA: Escondemos las dos rayas y mostramos el triángulo de Play
        iconPause.style.display = 'none';
        iconPlay.style.setProperty('display', 'block', 'important');
        iconPlay.classList.remove('hidden');
    } else {
        // Si está REPRODUCIENDO: Mostramos las dos rayas de pausa y escondemos el Play
        iconPause.style.setProperty('display', 'block', 'important');
        iconPause.classList.remove('hidden');
        iconPlay.style.display = 'none';
    }
}

// 6. Saltos de Tiempo (+15s / -15s)
function skipTime(seconds) {
    if (!currentMedia) return;

    if (currentMedia.type === 'video') {
        videoElement.currentTime += seconds;
    } else if (currentMedia.type === 'image' && autoAdvance) {
        imageElapsed -= (seconds * 1000);
        if (imageElapsed < 0) imageElapsed = 0;

        if (!isPaused) {
            clearInterval(imageProgressInterval);
            clearTimeout(imageTimer);
            resumeImageSequence();
        } else {
            const percent = Math.min((imageElapsed / IMAGE_DURATION) * 100, 100);
            progressFill.style.width = `${percent}%`;
        }
    }
}

// 7. Temporizadores de las Imágenes
function startImageSequence() {
    if (!autoAdvance) {
        progressFill.style.width = '0%';
        timeLeft.textContent = "Manual";
        timeRight.textContent = "";
        return;
    }
    imageElapsed = 0;
    resumeImageSequence();
}

function resumeImageSequence() {
    imageProgressInterval = setInterval(() => {
        imageElapsed += 100;
        const percent = Math.min((imageElapsed / IMAGE_DURATION) * 100, 100);
        progressFill.style.width = `${percent}%`;

        const secondsCurrent = Math.floor(imageElapsed / 1000);
        timeLeft.textContent = formatTime(secondsCurrent);
        timeRight.textContent = `-${formatTime(Math.max(5 - secondsCurrent, 0))}`;
    }, 100);

    imageTimer = setTimeout(() => {
        loadNextMedia();
    }, IMAGE_DURATION - imageElapsed);
}

// 8. Progreso del Vídeo Nativo
function updateVideoProgress() {
    if (!videoElement.duration || isPaused) return;
    const percent = (videoElement.currentTime / videoElement.duration) * 100;
    progressFill.style.width = `${percent}%`;

    timeLeft.textContent = `${formatTime(videoElement.currentTime)} / ${formatTime(videoElement.duration)}`;
    timeRight.textContent = `-${formatTime(videoElement.duration - videoElement.currentTime)}`;
}

function setupVideoControls() {
    videoElement.loop = false;
    if (btnLoop) btnLoop.textContent = "🔁 Repetir: OFF";
}

function handlePrevious() {
    // Por ahora recarga un nuevo random
    loadNextMedia();
}

function toggleAutoAdvance() {
    autoAdvance = !autoAdvance;
    if (btnAuto) btnAuto.textContent = `⏸ Auto-skip: ${autoAdvance ? 'ON' : 'OFF'}`;
    if (currentMedia && currentMedia.type === 'image') {
        resetTimers();
        startImageSequence();
    }
}

function toggleLoop() {
    videoElement.loop = !videoElement.loop;
    if (btnLoop) btnLoop.textContent = `🔁 Repetir: ${videoElement.loop ? 'ON' : 'OFF'}`;
}

function resetTimers() {
    clearTimeout(imageTimer);
    clearInterval(imageProgressInterval);
    if (progressFill) progressFill.style.width = '0%';
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function handleRestart() {
    if (!currentMedia) return;

    if (currentMedia.type === 'video') {
        // En vídeo volvemos al segundo cero de forma nativa
        videoElement.currentTime = 0;
        if (isPaused) {
            // Si estaba pausado, actualizamos la barra visualmente a 0
            progressFill.style.width = '0%';
            timeLeft.textContent = `00:00 / ${formatTime(videoElement.duration)}`;
        }
    } else if (currentMedia.type === 'image' && autoAdvance) {
        // En imagen, reseteamos el tiempo transcurrido y volvemos a lanzar los timers
        clearInterval(imageProgressInterval);
        clearTimeout(imageTimer);
        imageElapsed = 0;

        if (!isPaused) {
            resumeImageSequence();
        } else {
            progressFill.style.width = '0%';
            timeLeft.textContent = "00:00";
            timeRight.textContent = "-00:05";
        }
    }
}

let inactivityTimer = null;
const INACTIVITY_DELAY = 2500; // 2.5 segundos

function resetInactivityTimer() {
    // 1. Cada vez que se mueve el ratón, marcamos al usuario como activo
    document.body.classList.add('user-active');
    document.body.style.cursor = 'default'; // Mostramos el puntero del ratón

    // 2. Limpiamos el temporizador anterior para que no se acumule
    clearTimeout(inactivityTimer);

    // 3. Iniciamos la cuenta atrás de 2.5 segundos de inactividad
    inactivityTimer = setTimeout(() => {
        // Si el archivo está pausado, NO ocultamos los controles (comportamiento estándar de Netflix/YouTube)
        if (isPaused) return;

        // Si se cumple el tiempo reproduciendo, añadimos el fade out ocultando todo
        document.body.classList.remove('user-active');
        document.body.style.cursor = 'none'; // Escondemos el puntero del ratón para modo cine total
    }, INACTIVITY_DELAY);
}