import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
         createUserWithEmailAndPassword, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where,
         getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- CONSTANTES ---------- */
const ADMIN_EMAIL  = "iaysoftwareliliput@gmail.com";
const PREVIEW_ROWS = 5;
// JORNADA_COMPLETA_MINUTOS eliminada: ahora se calcula por horario real de cada empleado

/* ---------- CONFIGURACIÓN DE GEOFENCIA ---------- */
const OFFICE_LOCATION = {
  lat: -5.182824105794872,
  lng: -80.65569480769832,
  radius: 20 // metros
};

/* ---------- FIREBASE INIT ---------- */
const app  = initializeApp({
  apiKey:"AIzaSyCJSvqmd1v1FTS53n_6yqHX429Ca65Yh1A",
  authDomain:"horadellegada.firebaseapp.com",
  projectId:"horadellegada",
  storageBucket:"horadellegada.firebasestorage.app",
  messagingSenderId:"509263431300",
  appId:"1:509263431300:web:59c3aaee53372baca7e4d1"
});
const auth = getAuth(app);
const db   = getFirestore(app);

/* ---------- UTILS ---------- */
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const esc = s => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const ini = name => (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
const fmtDate = str => {
  const [y, m, d] = str.split("-");
  const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${parseInt(d)} ${M[parseInt(m) - 1]} ${y}`;
};
const formatTime = (hour, minute) => `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function formatWorkSchedule(workSchedule) {
  if (!workSchedule || Object.keys(workSchedule).length === 0) return "Sin horario definido";
  const parts = [];
  for (let i = 1; i <= 7; i++) {
    if (workSchedule[i]) {
      const d = workSchedule[i];
      parts.push(`${dayNames[i - 1].substring(0, 3)}: ${formatTime(d.startHour, d.startMinute)}-${formatTime(d.endHour, d.endMinute)}`);
    }
  }
  return parts.join(', ');
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ---------- TOAST ---------- */
function showToast(message, type = "info", duration = 5000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, duration);
}

/* ---------- PANTALLAS ---------- */
function showScreen(id) {
  ["loginScreen", "empScreen", "adminScreen"].forEach(s =>
    document.getElementById(s).classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* ---------- GEOFENCIA ---------- */
let watchId = null;
let currentLocation = null;
let lastDistance = null;

let geoRetryCount = 0;
const GEO_MAX_RETRIES = 5;

function startGeofenceWatch() {
  if (!navigator.geolocation) {
    document.getElementById("locationStatus").textContent = "Geolocalización no soportada";
    return;
  }
  geoRetryCount = 0;
  document.getElementById("locationStatus").textContent = "📡 Obteniendo ubicación...";
  document.getElementById("locationStatus").style.color = "var(--muted)";
  _watchPosition();
}

function _watchPosition() {
  // Primero intenta con baja precisión para obtener algo rápido
  const optionsFast = { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 };
  // Luego refina con alta precisión
  const optionsHigh = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 };

  // Obtener posición rápida primero (como fallback mientras espera el GPS)
  navigator.geolocation.getCurrentPosition(
    (position) => _handleGeoSuccess(position),
    () => {}, // silencioso si falla el rápido
    optionsFast
  );

  // Watch con alta precisión (el principal)
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      geoRetryCount = 0;
      _handleGeoSuccess(position);
    },
    (error) => {
      if (error.code === error.TIMEOUT && geoRetryCount < GEO_MAX_RETRIES) {
        geoRetryCount++;
        const statusEl = document.getElementById("locationStatus");
        statusEl.textContent = `📡 Buscando señal GPS... (intento ${geoRetryCount}/${GEO_MAX_RETRIES})`;
        statusEl.style.color = "var(--warning)";
        // Reintentar automáticamente
        setTimeout(() => {
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
          _watchPosition();
        }, 3000);
        return;
      }
      let msg = "";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          msg = "⛔ Permiso de ubicación denegado. Actívalo en ajustes."; break;
        case error.POSITION_UNAVAILABLE:
          msg = "📵 Ubicación no disponible. Verifica el GPS."; break;
        case error.TIMEOUT:
          msg = "⏱️ No se pudo obtener ubicación. Toca 🔄 para reintentar."; break;
        default:
          msg = "❌ Error de ubicación: " + error.message;
      }
      const statusEl = document.getElementById("locationStatus");
      statusEl.textContent = msg;
      statusEl.style.color = "var(--danger)";
      document.getElementById("checkBtn").disabled = true;
      document.getElementById("exitBtn").disabled = true;
      const retryBtn = document.getElementById("retryGpsBtn");
      if (retryBtn) retryBtn.style.display = "block";
    },
    optionsHigh
  );
}

function _handleGeoSuccess(position) {
  const { latitude, longitude, accuracy } = position.coords;
  currentLocation = { lat: latitude, lng: longitude, accuracy };
  const distance = calculateDistance(latitude, longitude, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
  lastDistance = Math.round(distance);
  const within = distance <= OFFICE_LOCATION.radius;
  const btnEntrada = document.getElementById("checkBtn");
  const btnSalida = document.getElementById("exitBtn");
  const statusEl = document.getElementById("locationStatus");
  if (within) {
    statusEl.textContent = `📍 Estás a ${lastDistance}m de la oficina (dentro del área)`;
    statusEl.style.color = "var(--success)";
    btnEntrada.disabled = false;
    btnSalida.disabled = false;
  } else {
    statusEl.textContent = `🌍 Estás a ${lastDistance}m de la oficina (fuera del área)`;
    statusEl.style.color = "var(--danger)";
    btnEntrada.disabled = true;
    btnSalida.disabled = true;
  }
  const retryBtn = document.getElementById("retryGpsBtn");
  if (retryBtn) retryBtn.style.display = "none";
  if (btnEntrada.style.display === "none") btnEntrada.disabled = true;
  if (btnSalida.style.display === "none") btnSalida.disabled = true;
}

function stopGeofenceWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    currentLocation = null;
  }
}

window.retryGPS = () => {
  stopGeofenceWatch();
  geoRetryCount = 0;
  const statusEl = document.getElementById("locationStatus");
  statusEl.textContent = "📡 Buscando ubicación...";
  statusEl.style.color = "var(--muted)";
  startGeofenceWatch();
};

/* ---------- ADMIN PANEL NAV ---------- */
window.showAdminPanel = () => {
  stopGeofenceWatch();
  showScreen("adminScreen");
  document.getElementById("filterDate").value = todayStr();
  document.getElementById("filterDate").max = todayStr();
  loadAttendance();
  loadUsers();
};

window.goToEmployeeScreen = () => {
  showScreen("empScreen");
  const user = auth.currentUser;
  if (user) {
    updateEmployeeView(user);
    startGeofenceWatch();
  }
};

/* ---------- RELOJ ---------- */
let clockInterval = null;
function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  const upd = () => {
    const n = new Date();
    document.getElementById("clockTime").textContent = n.toLocaleTimeString('es-PE', { hour12: false });
    document.getElementById("clockDate").textContent =
      n.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  upd();
  clockInterval = setInterval(upd, 1000);
}
function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
}

/* ---------- OBTENER HORARIO DEL EMPLEADO ---------- */
async function getEmployeeSchedule(uid) {
  try {
    const userDoc = await getDoc(doc(db, "usuarios", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return { workSchedule: data.workSchedule || {} };
    }
  } catch (e) {
    console.error("Error obteniendo horario:", e);
  }
  return { workSchedule: {} };
}

/* ---------- FUNCIÓN PARA CALCULAR SALDO TOTAL DESDE PRIMERA ASISTENCIA ---------- */
async function calcularSaldoTotal(uid) {
  try {
    const usuarioDoc = await getDoc(doc(db, "usuarios", uid));
    if (!usuarioDoc.exists()) return 0;
    
    const usuario = usuarioDoc.data();
    if (usuario.role === 'admin') return 0;

    // Obtener asistencias del usuario
    const asistenciasQuery = query(
      collection(db, "asistencias"),
      where("uid", "==", uid)
    );
    const asistenciasSnap = await getDocs(asistenciasQuery);
    
    if (asistenciasSnap.empty) return 0;

    // Construir mapa de asistencias
    const asistenciasMap = new Map();
    asistenciasSnap.forEach(docSnap => {
      const data = docSnap.data();
      asistenciasMap.set(data.fecha, data);
    });

    // FECHA DE INICIO: la primera asistencia registrada del empleado
    const fechasOrdenadas = [...asistenciasMap.keys()].sort();
    const FECHA_INICIO = fechasOrdenadas[0];

    console.log(`📅 Calculando saldo desde primera asistencia: ${FECHA_INICIO}`);

    let saldoTotal = 0;
    const hoy = new Date();
    const hoyStr = todayStr();

    // Recorrer días desde la primera asistencia hasta HOY (sin incluir hoy en faltas)
    const inicio = new Date(FECHA_INICIO + "T00:00:00");
    const fin = new Date(hoyStr + "T00:00:00");

    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      const fechaStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      let dayNum = d.getDay();
      dayNum = dayNum === 0 ? 7 : dayNum;

      const diaLaboral = usuario.workSchedule?.[dayNum];
      
      // Saltar días sin horario definido
      if (!diaLaboral) continue;

      // Calcular minutos esperados de la jornada de ese día específico
      const minutosJornada = (diaLaboral.endHour * 60 + diaLaboral.endMinute) -
                             (diaLaboral.startHour * 60 + diaLaboral.startMinute);
      
      const asistencia = asistenciasMap.get(fechaStr);

      // Comparar si el día ya pasó completamente (no es hoy)
      const esHoy = fechaStr === hoyStr;

      if (asistencia) {
        if (esHoy) {
          // Hoy: si ya registró salida, contar tardanza + salida anticipada/extra
          // Si aún no salió, solo contar tardanza (día en curso)
          if (asistencia.salidaHora) {
            const minutosDia = (asistencia.lateMinutes || 0) + (asistencia.exitMinutes || 0);
            saldoTotal += minutosDia;
            if (minutosDia !== 0) console.log(`📊 ${fechaStr} (hoy, completo): ${minutosDia} min`);
          } else {
            const minutosTardanza = asistencia.lateMinutes || 0;
            saldoTotal += minutosTardanza;
            if (minutosTardanza !== 0) console.log(`📊 ${fechaStr} (hoy, entrada): ${minutosTardanza} min tardanza`);
          }
        } else {
          // Día pasado trabajado: tardanza + salida anticipada/extra
          const minutosDia = (asistencia.lateMinutes || 0) + (asistencia.exitMinutes || 0);
          saldoTotal += minutosDia;
          if (minutosDia !== 0) console.log(`📊 ${fechaStr}: +${minutosDia} min`);
        }
      } else {
        // Día laboral SIN asistencia: solo penalizar si el día ya pasó (no hoy)
        if (!esHoy) {
          saldoTotal += minutosJornada;
          console.log(`⚡ ${fechaStr}: +${minutosJornada} min (ausencia)`);
        }
      }
    }

    // Días extras: trabajar en día NO laborable (se RESTAN minutos al saldo)
    for (const [fechaStr, asistencia] of asistenciasMap.entries()) {
      if (!asistencia.hora || !asistencia.salidaHora) continue;
      if (asistencia.hora === '--:--:--' || asistencia.salidaHora === '--:--:--') continue;
      
      const fecha = new Date(fechaStr + "T00:00:00");
      let dayNum = fecha.getDay();
      dayNum = dayNum === 0 ? 7 : dayNum;
      const diaLaboral = usuario.workSchedule?.[dayNum];
      
      if (!diaLaboral) {
        const [hEnt, mEnt] = asistencia.hora.split(':').map(Number);
        const [hSal, mSal] = asistencia.salidaHora.split(':').map(Number);
        const minutosTrabajados = (hSal * 60 + mSal) - (hEnt * 60 + mEnt);
        if (minutosTrabajados > 0) {
          saldoTotal -= minutosTrabajados;
          console.log(`⭐ ${fechaStr}: -${minutosTrabajados} min (trabajó en día libre)`);
        }
      }
    }

    console.log(`📊 SALDO TOTAL: ${saldoTotal} minutos`);
    return saldoTotal;

  } catch (error) {
    console.error("Error calculando saldo total:", error);
    return 0;
  }
}

/* ---------- ACTUALIZAR VISTA EMPLEADO ---------- */
async function updateEmployeeView(user) {
  const name = user.displayName || user.email.split("@")[0];
  document.getElementById("empEmailChip").textContent = user.email;
  document.getElementById("empNameDisplay").textContent = name;
  document.getElementById("empEmailDisplay").textContent = user.email;

  const schedule = await getEmployeeSchedule(user.uid);
  const scheduleStr = formatWorkSchedule(schedule.workSchedule);
  document.getElementById("scheduleNote").innerHTML = `Horario esperado: <span>${scheduleStr}</span>`;

  await checkToday(user);

  const saldoTotal = await calcularSaldoTotal(user.uid);
  const saldoElement = document.getElementById("totalLateMinutes");
  if (saldoElement) {
    saldoElement.textContent = saldoTotal;
    if (saldoTotal > 0) {
      saldoElement.style.color = "var(--danger)";
      saldoElement.parentElement.style.background = "var(--danger-l)";
    } else if (saldoTotal < 0) {
      saldoElement.style.color = "var(--success)";
      saldoElement.parentElement.style.background = "var(--success-l)";
    } else {
      saldoElement.style.color = "var(--warning)";
      saldoElement.parentElement.style.background = "var(--warning-l)";
    }
  }
}

/* ---------- AUTH STATE ---------- */
onAuthStateChanged(auth, async user => {
  if (!user) {
    stopClock();
    stopGeofenceWatch();
    showScreen("loginScreen");
    return;
  }

  let userDoc = await getDoc(doc(db, "usuarios", user.uid));
  if (!userDoc.exists()) {
    await setDoc(doc(db, "usuarios", user.uid), {
      uid: user.uid,
      nombre: user.displayName || user.email.split("@")[0],
      email: user.email,
      workSchedule: {},
      role: user.email === ADMIN_EMAIL ? "admin" : "empleado",
      creadoEn: Timestamp.now()
    });
    userDoc = await getDoc(doc(db, "usuarios", user.uid));
  }

  const role = userDoc.data().role;

  if (role === "admin") {
    document.getElementById("goToAdminBtn").style.display = "inline-block";
    document.getElementById("adminEmail").textContent = user.email;
  } else {
    document.getElementById("goToAdminBtn").style.display = "none";
  }

  showScreen("empScreen");
  startClock();
  await updateEmployeeView(user);
  startGeofenceWatch();

  initDaysScheduleUI();
});

/* ---------- LOGIN ---------- */
window.doLogin = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const btn = document.getElementById("loginBtn");
  const err = document.getElementById("loginError");
  err.classList.remove("show");
  if (!email || !pass) { err.textContent = "Completa todos los campos."; err.classList.add("show"); return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Verificando...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    let m = "Error al iniciar sesión.";
    if (["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].includes(e.code))
      m = "Correo o contraseña incorrectos.";
    else if (e.code === "auth/invalid-email") m = "Correo no válido.";
    else if (e.code === "auth/too-many-requests") m = "Demasiados intentos. Intenta más tarde.";
    err.textContent = m; err.classList.add("show");
  } finally {
    btn.disabled = false; btn.innerHTML = "Entrar";
  }
};
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && !document.getElementById("loginScreen").classList.contains("hidden"))
    window.doLogin();
});

/* ---------- LOGOUT ---------- */
window.doLogout = () => {
  stopClock();
  stopGeofenceWatch();
  signOut(auth);
};

/* ---------- CHECK TODAY ---------- */
async function checkToday(user) {
  const q = query(collection(db, "asistencias"),
    where("uid", "==", user.uid), where("fecha", "==", todayStr()));
  const snap = await getDocs(q);
  const btnEntrada = document.getElementById("checkBtn");
  const btnSalida = document.getElementById("exitBtn");
  const alreadyBox = document.getElementById("alreadyBox");
  const alreadyTime = document.getElementById("alreadyTime");

  if (!snap.empty) {
    const docData = snap.docs[0].data();
    const docId = snap.docs[0].id;
    window.currentAttendanceDocId = docId;

    btnEntrada.style.display = "none";
    alreadyBox.style.display = "block";
    let estado = `Entrada: ${docData.hora}`;

    if (docData.salidaHora) {
      btnSalida.style.display = "none";
      estado += ` · Salida: ${docData.salidaHora}`;
    } else {
      btnSalida.style.display = "block";
    }

    alreadyTime.textContent = estado;
  } else {
    btnEntrada.style.display = "block";
    btnSalida.style.display = "none";
    alreadyBox.style.display = "none";
    window.currentAttendanceDocId = null;
  }
}

/* ---------- MARCAR ENTRADA ---------- */
window.markAttendance = async () => {
  const user = auth.currentUser; if (!user) return;
  const btn = document.getElementById("checkBtn");

  if (!currentLocation) {
    showToast("No se ha podido obtener tu ubicación. Intenta de nuevo.", "warning");
    return;
  }
  const distance = calculateDistance(currentLocation.lat, currentLocation.lng, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
  if (distance > OFFICE_LOCATION.radius) {
    showToast("No estás dentro del área permitida para registrar asistencia.", "warning");
    return;
  }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Registrando...';

  try {
    const schedule = await getEmployeeSchedule(user.uid);
    const now = new Date();
    const hora = now.toLocaleTimeString('es-PE', { hour12: false });
    const fecha = todayStr();

    let lateMinutes = 0;
    const dayOfWeek = now.getDay();
    let dayNum = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daySchedule = schedule.workSchedule[dayNum];
    if (daySchedule) {
      const scheduledStart = new Date(now);
      scheduledStart.setHours(daySchedule.startHour, daySchedule.startMinute, 0, 0);
      if (now > scheduledStart) {
        const diffMs = now - scheduledStart;
        lateMinutes = Math.round(diffMs / 60000);
      }
    }

    await addDoc(collection(db, "asistencias"), {
      uid: user.uid,
      email: user.email,
      nombre: user.displayName || user.email.split("@")[0],
      fecha,
      hora,
      timestamp: Timestamp.fromDate(now),
      horarioEsperado: formatWorkSchedule(schedule.workSchedule),
      location: {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: currentLocation.accuracy
      },
      distanceFromOffice: Math.round(distance),
      withinGeofence: true,
      lateMinutes: lateMinutes
    });

    btn.style.display = "none";
    document.getElementById("alreadyBox").style.display = "block";
    document.getElementById("alreadyTime").textContent = "Entrada: " + hora;
    document.getElementById("exitBtn").style.display = "block";

    showToast("Entrada registrada correctamente", "success");

    const saldoTotal = await calcularSaldoTotal(user.uid);
    const saldoElement = document.getElementById("totalLateMinutes");
    if (saldoElement) saldoElement.textContent = saldoTotal;

    if (document.getElementById("personalHistory").style.display === "block") {
      loadPersonalHistory(user.uid);
    }
  } catch (e) {
    showToast("Error: " + e.message, "error");
    btn.disabled = false; btn.innerHTML = "✔ Registrar entrada";
    if (currentLocation) {
      const d = calculateDistance(currentLocation.lat, currentLocation.lng, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
      btn.disabled = d > OFFICE_LOCATION.radius;
    }
  }
};

/* ---------- MARCAR SALIDA ---------- */
window.markExit = async () => {
  const user = auth.currentUser; if (!user) return;
  const btn = document.getElementById("exitBtn");

  if (!currentLocation) {
    showToast("No se ha podido obtener tu ubicación. Intenta de nuevo.", "warning");
    return;
  }
  const distance = calculateDistance(currentLocation.lat, currentLocation.lng, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
  if (distance > OFFICE_LOCATION.radius) {
    showToast("No estás dentro del área permitida para registrar salida.", "warning");
    return;
  }

  if (!window.currentAttendanceDocId) {
    showToast("No hay registro de entrada para hoy", "warning");
    return;
  }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Registrando...';

  try {
    const schedule = await getEmployeeSchedule(user.uid);
    const now = new Date();
    const horaSalida = now.toLocaleTimeString('es-PE', { hour12: false });

    let exitMinutes = 0;
    const dayOfWeek = now.getDay();
    let dayNum = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daySchedule = schedule.workSchedule[dayNum];
    if (daySchedule) {
      const scheduledEnd = new Date(now);
      scheduledEnd.setHours(daySchedule.endHour, daySchedule.endMinute, 0, 0);
      if (now < scheduledEnd) {
        const diffMs = scheduledEnd - now;
        exitMinutes = Math.round(diffMs / 60000);
      } else if (now > scheduledEnd) {
        const diffMs = now - scheduledEnd;
        exitMinutes = -Math.round(diffMs / 60000);
      }
    }

    const docRef = doc(db, "asistencias", window.currentAttendanceDocId);
    await updateDoc(docRef, {
      salidaHora: horaSalida,
      salidaTimestamp: Timestamp.fromDate(now),
      exitMinutes: exitMinutes,
      salidaLocation: {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: currentLocation.accuracy
      },
      salidaDistance: Math.round(distance),
      salidaWithinGeofence: true
    });

    btn.style.display = "none";
    document.getElementById("alreadyTime").textContent += ` · Salida: ${horaSalida}`;

    showToast("Salida registrada correctamente", "success");

    const saldoTotal = await calcularSaldoTotal(user.uid);
    const saldoElement = document.getElementById("totalLateMinutes");
    if (saldoElement) saldoElement.textContent = saldoTotal;

    if (document.getElementById("personalHistory").style.display === "block") {
      loadPersonalHistory(user.uid);
    }
  } catch (e) {
    showToast("Error: " + e.message, "error");
    btn.disabled = false; btn.innerHTML = "🚪 Registrar salida";
    if (currentLocation) {
      const d = calculateDistance(currentLocation.lat, currentLocation.lng, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
      btn.disabled = d > OFFICE_LOCATION.radius;
    }
  }
};

/* ---------- CAMBIAR CONTRASEÑA ---------- */
window.showPasswordChange = () => {
  const currentPassword = prompt("Ingresa tu contraseña actual:");
  if (!currentPassword) return;
  const newPassword = prompt("Ingresa la nueva contraseña (mínimo 6 caracteres):");
  if (!newPassword || newPassword.length < 6) {
    showToast("La contraseña debe tener al menos 6 caracteres", "warning");
    return;
  }
  const user = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  reauthenticateWithCredential(user, credential)
    .then(() => updatePassword(user, newPassword))
    .then(() => showToast("Contraseña actualizada correctamente", "success"))
    .catch(error => {
      if (error.code === "auth/wrong-password") showToast("Contraseña actual incorrecta", "error");
      else showToast("Error: " + error.message, "error");
    });
};

/* ---------- HISTORIAL PERSONAL ---------- */
window.toggleHistory = async () => {
  const histDiv = document.getElementById("personalHistory");
  if (histDiv.style.display === "none") {
    histDiv.style.display = "block";
    await loadPersonalHistory(auth.currentUser.uid);
  } else {
    histDiv.style.display = "none";
  }
};

async function loadPersonalHistory(uid) {
  const listDiv = document.getElementById("historyList");
  listDiv.innerHTML = "Cargando...";
  try {
    const q = query(collection(db, "asistencias"), where("uid", "==", uid));
    const snap = await getDocs(q);
    let registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    registros.sort((a, b) => a.fecha.localeCompare(b.fecha) * -1);

    if (registros.length === 0) {
      listDiv.innerHTML = "<div style='padding:16px; text-align:center; color:var(--muted);'>Sin registros</div>";
      return;
    }

    let html = '<table class="history-table"><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Min</th></tr></thead><tbody>';
    registros.forEach(r => {
      const entrada = r.hora || '—';
      const salida = r.salidaHora || '—';
      const minutos = (r.lateMinutes || 0) + (r.exitMinutes || 0);
      html += `<tr><td>${fmtDate(r.fecha)}</td><td>${entrada}</td><td>${salida}</td><td>${minutos > 0 ? '+' : ''}${minutos}</td></tr>`;
    });
    html += '</tbody></table>';
    listDiv.innerHTML = html;
  } catch (e) {
    listDiv.innerHTML = `<div style="color:var(--danger);">Error: ${esc(e.message)}</div>`;
  }
}

/* ---------- ADMIN: cargar asistencias ---------- */
window.loadAttendance = async () => {
  const area = document.getElementById("empCardsArea");
  area.innerHTML = '<div class="loading-center">Cargando registros...</div>';
  const fecha = document.getElementById("filterDate").value || todayStr();
  document.getElementById("filterDate").value = fecha;

  try {
    const usersSnap = await getDocs(collection(db, "usuarios"));
    const usuarios = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (usuarios.length === 0) {
      area.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No hay usuarios aún</div><div class="empty-sub">Crea usuarios desde "Crear usuario"</div></div>`;
      document.getElementById("stTotal").textContent = "0";
      return;
    }

    const daySnap = await getDocs(query(collection(db, "asistencias"), where("fecha", "==", fecha)));
    const dayAtt = daySnap.docs.map(d => ({ id: d.id, ...d.data() }));

    document.getElementById("stTotal").textContent = dayAtt.length;

    area.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "emp-cards-grid";

    for (const u of usuarios) {
      const todayRec = dayAtt.find(a => a.uid === u.id) || null;
      const card = await buildCardLazy(u, fecha, todayRec);
      grid.appendChild(card);
    }
    area.appendChild(grid);
  } catch (e) {
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">Error al cargar</div><div class="empty-sub">${esc(e.message)}</div></div>`;
  }
};

async function buildCardLazy(user, selectedDate, todayRec) {
  const card = document.createElement("div");
  card.className = "emp-att-card";

  const scheduleStr = user.role === 'admin' ? '👑 Administrador' : formatWorkSchedule(user.workSchedule || {});

  let badgeText = "Sin registro hoy";
  let locationBadge = "";
  if (todayRec) {
    badgeText = `Entrada: ${todayRec.hora}`;
    if (todayRec.salidaHora) badgeText += ` · Salida: ${todayRec.salidaHora}`;
    if (todayRec.location) {
      const within = todayRec.withinGeofence ? "📍" : "🌍";
      const dist = todayRec.distanceFromOffice ? ` a ${todayRec.distanceFromOffice}m` : "";
      locationBadge = `<span class="mini-badge location-badge" title="Precisión: ${todayRec.location.accuracy?.toFixed(0)}m">${within}${dist}</span>`;
    }
    const total = (todayRec.lateMinutes || 0) + (todayRec.exitMinutes || 0);
    if (total !== 0) {
      badgeText += ` (${total > 0 ? '+' : ''}${total} min)`;
    }
  }
  const deleteBtn = todayRec ? `<span class="delete-att" title="Eliminar registro de hoy" data-id="${todayRec.id}" data-uid="${user.id}" data-fecha="${selectedDate}">🗑️</span>` : "";
  const addBtn = user.role !== 'admin' ? `<span class="add-att" title="Agregar registro manual" data-uid="${user.id}" data-nombre="${esc(user.nombre)}">➕</span>` : "";

  card.innerHTML = `
    <div class="eac-header">
      <div class="eac-avatar">${ini(user.nombre)}</div>
      <div class="eac-info">
        <div class="eac-name">${esc(user.nombre)}</div>
        <div class="eac-email">${esc(user.email)}</div>
        <div class="eac-schedule">${scheduleStr}</div>
      </div>
      <div class="eac-today-badge">
        <span class="mini-badge">${badgeText}</span>
        ${locationBadge}
        ${addBtn}
        ${deleteBtn}
      </div>
    </div>
    <div class="eac-body" id="eac-body-${user.id}">
      <div class="loading-center" style="padding:20px;">Cargando historial reciente...</div>
    </div>
  `;

  if (user.role !== 'admin') {
    const saldoTotal = await calcularSaldoTotal(user.id);
    const badgeContainer = card.querySelector('.eac-today-badge');
    if (badgeContainer) {
      const saldoBadge = document.createElement('span');
      saldoBadge.className = 'mini-badge';
      saldoBadge.style.background = saldoTotal > 0 ? 'var(--danger-l)' : (saldoTotal < 0 ? 'var(--success-l)' : 'var(--warning-l)');
      saldoBadge.style.color = saldoTotal > 0 ? 'var(--danger)' : (saldoTotal < 0 ? 'var(--success)' : 'var(--warning)');
      saldoBadge.innerHTML = `💰 ${saldoTotal > 0 ? '+' : ''}${saldoTotal} min`;
      badgeContainer.appendChild(saldoBadge);
    }
  }

  if (todayRec) {
    const delSpan = card.querySelector(`.delete-att[data-id="${todayRec.id}"]`);
    delSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAttendance(todayRec.id, user.id, selectedDate, card);
    });
  }

  if (user.role !== 'admin') {
    const addSpan = card.querySelector(`.add-att[data-uid="${user.id}"]`);
    if (addSpan) {
      addSpan.addEventListener("click", (e) => {
        e.stopPropagation();
        window.openManualAttModal(user.id, user.nombre, user.workSchedule || {});
      });
    }
  }

  const body = card.querySelector(`#eac-body-${user.id}`);
  await loadUserHistoryPreview(user.id, body, selectedDate, PREVIEW_ROWS);

  return card;
}

/* ---------- ADMIN: cargar vista previa ---------- */
async function loadUserHistoryPreview(uid, container, selectedDate, limitCount) {
  try {
    const q = query(collection(db, "asistencias"), where("uid", "==", uid));
    const snap = await getDocs(q);
    let registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    registros.sort((a, b) => {
      if (a.fecha > b.fecha) return -1;
      if (a.fecha < b.fecha) return 1;
      return b.hora.localeCompare(a.hora);
    });

    const preview = registros.slice(0, limitCount);

    if (preview.length === 0) {
      container.innerHTML = `<div class="eac-empty">Sin registros de asistencia aún</div>`;
      return;
    }

    let html = `<table><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Min</th><th></th></tr></thead><tbody>`;
    preview.forEach(r => {
      const isToday = r.fecha === selectedDate;
      const fechaFormateada = fmtDate(r.fecha) + (isToday ? ' (hoy)' : '');
      const entrada = r.hora || '—';
      const salida = r.salidaHora || '—';
      const minutos = (r.lateMinutes || 0) + (r.exitMinutes || 0);
      const locationIcon = r.location ? (r.withinGeofence ? '📍' : '🌍') : '';
      html += `<tr class="${isToday ? 'is-today' : ''}">
        <td>${fechaFormateada}</td>
        <td>${entrada}</td>
        <td>${salida}</td>
        <td>${minutos > 0 ? '+' : ''}${minutos}</td>
        <td style="text-align:right;">
          ${locationIcon}
          <span class="delete-att" data-id="${r.id}" data-uid="${uid}" data-fecha="${r.fecha}">🗑️</span>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';

    if (registros.length > limitCount) {
      html += `<button class="eac-more-btn" data-uid="${uid}" data-selected="${selectedDate}">▼ Ver historial completo (${registros.length} registros)</button>`;
    }

    container.innerHTML = html;

    container.querySelectorAll(".delete-att").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const uid = btn.dataset.uid;
        const fecha = btn.dataset.fecha;
        deleteAttendance(id, uid, fecha, container.closest(".emp-att-card"));
      });
    });

    const moreBtn = container.querySelector(".eac-more-btn");
    if (moreBtn) {
      moreBtn.addEventListener("click", async () => {
        await loadFullUserHistory(uid, container, selectedDate);
      });
    }
  } catch (e) {
    container.innerHTML = `<div class="eac-empty">Error al cargar: ${esc(e.message)}</div>`;
  }
}

/* ---------- ADMIN: cargar historial completo ---------- */
async function loadFullUserHistory(uid, container, selectedDate) {
  container.innerHTML = `<div class="loading-center" style="padding:20px;">Cargando todo el historial...</div>`;
  try {
    const q = query(collection(db, "asistencias"), where("uid", "==", uid));
    const snap = await getDocs(q);
    let registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    registros.sort((a, b) => {
      if (a.fecha > b.fecha) return -1;
      if (a.fecha < b.fecha) return 1;
      return b.hora.localeCompare(a.hora);
    });

    let html = `<table class="eac-table"><thead> <tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Min</th><th></th></tr> </thead><tbody>`;
    registros.forEach(r => {
      const isToday = r.fecha === selectedDate;
      const fechaFormateada = fmtDate(r.fecha) + (isToday ? ' (hoy)' : '');
      const entrada = r.hora || '—';
      const salida = r.salidaHora || '—';
      const minutos = (r.lateMinutes || 0) + (r.exitMinutes || 0);
      const locationIcon = r.location ? (r.withinGeofence ? '📍' : '🌍') : '';
      html += `<tr class="${isToday ? 'is-today' : ''}">
         <td>${fechaFormateada}</td>
         <td>${entrada}</td>
         <td>${salida}</td>
         <td>${minutos > 0 ? '+' : ''}${minutos}</td>
        <td style="text-align:right;">
          ${locationIcon}
          <span class="delete-att" data-id="${r.id}" data-uid="${uid}" data-fecha="${r.fecha}">🗑️</span>
         </td>
       </tr>`;
    });
    html += '</tbody></table>';
    html += `<button class="eac-more-btn" data-uid="${uid}" data-selected="${selectedDate}">▲ Ver menos</button>`;

    container.innerHTML = html;

    container.querySelectorAll(".delete-att").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const uid = btn.dataset.uid;
        const fecha = btn.dataset.fecha;
        deleteAttendance(id, uid, fecha, container.closest(".emp-att-card"));
      });
    });

    const lessBtn = container.querySelector(".eac-more-btn");
    if (lessBtn) {
      lessBtn.addEventListener("click", async () => {
        await loadUserHistoryPreview(uid, container, selectedDate, PREVIEW_ROWS);
      });
    }
  } catch (e) {
    container.innerHTML = `<div class="eac-empty">Error al cargar: ${esc(e.message)}</div>`;
  }
}

async function deleteAttendance(docId, uid, fecha, cardElement) {
  if (!confirm("¿Estás seguro de eliminar este registro de asistencia?")) return;
  try {
    await deleteDoc(doc(db, "asistencias", docId));
    showToast("Registro eliminado", "success");
    const body = cardElement.querySelector(".eac-body");
    await loadUserHistoryPreview(uid, body, fecha, PREVIEW_ROWS);
    loadAttendance();
    if (auth.currentUser && auth.currentUser.uid === uid) {
      const saldoTotal = await calcularSaldoTotal(uid);
      const saldoElement = document.getElementById("totalLateMinutes");
      if (saldoElement) saldoElement.textContent = saldoTotal;
      if (document.getElementById("personalHistory").style.display === "block") {
        loadPersonalHistory(uid);
      }
    }
  } catch (e) {
    showToast("Error al eliminar: " + e.message, "error");
  }
}

window.exportToCSV = () => {
  const rows = [];
  rows.push(["Empleado", "Email", "Rol/Horario", "Fecha", "Entrada", "Salida", "Minutos totales", "Dentro geocerca", "Distancia (m)"]);
  document.querySelectorAll(".emp-att-card").forEach(card => {
    const header = card.querySelector(".eac-header");
    if (!header) return;
    const name = header.querySelector(".eac-name")?.textContent || "";
    const email = header.querySelector(".eac-email")?.textContent || "";
    const scheduleOrRole = header.querySelector(".eac-schedule")?.textContent || "";
    const rowsInCard = card.querySelectorAll(".eac-body table tr:not(:first-child)");
    rowsInCard.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 5) {
        const fecha = cells[0].textContent.replace('(hoy)', '').trim();
        const entrada = cells[1].textContent;
        const salida = cells[2].textContent;
        const minutos = cells[3].textContent;
        rows.push([name, email, scheduleOrRole, fecha, entrada, salida, minutos, "", ""]);
      }
    });
  });

  if (rows.length <= 1) {
    showToast("No hay datos para exportar", "info");
    return;
  }

  let csvContent = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `asistencias_${todayStr()}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Exportado a CSV", "success");
};

/* ---------- UI DÍAS (para crear y editar) ---------- */
function initDaysScheduleUI(containerId = "daysScheduleContainer", schedule = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const dayCheckboxes = [
    { id: 'dayMon', label: 'Lunes', value: 1 },
    { id: 'dayTue', label: 'Martes', value: 2 },
    { id: 'dayWed', label: 'Miércoles', value: 3 },
    { id: 'dayThu', label: 'Jueves', value: 4 },
    { id: 'dayFri', label: 'Viernes', value: 5 },
    { id: 'daySat', label: 'Sábado', value: 6 },
    { id: 'daySun', label: 'Domingo', value: 7 }
  ];

  let html = '';
  dayCheckboxes.forEach(day => {
    const dayData = schedule[day.value] || { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 };
    const checked = schedule[day.value] ? 'checked' : '';
    const display = schedule[day.value] ? 'flex' : 'none';
    html += `
      <div class="day-schedule" id="schedule-${day.value}-${containerId}">
        <div class="day-title">
          <label style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" id="${day.id}-${containerId}" value="${day.value}" onchange="toggleDaySchedule('${containerId}', ${day.value})" ${checked}> ${day.label}
          </label>
        </div>
        <div id="day-${day.value}-inputs-${containerId}" style="display:${display};" class="inline-inputs">
          <div class="field"><input type="number" id="day-${day.value}-startHour-${containerId}" min="0" max="23" value="${dayData.startHour}" placeholder="Hora inicio"></div>
          <div class="field"><input type="number" id="day-${day.value}-startMinute-${containerId}" min="0" max="59" value="${dayData.startMinute}" placeholder="Min inicio"></div>
          <span>a</span>
          <div class="field"><input type="number" id="day-${day.value}-endHour-${containerId}" min="0" max="23" value="${dayData.endHour}" placeholder="Hora fin"></div>
          <div class="field"><input type="number" id="day-${day.value}-endMinute-${containerId}" min="0" max="59" value="${dayData.endMinute}" placeholder="Min fin"></div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

window.toggleDaySchedule = (containerId, dayNum) => {
  const checkbox = document.getElementById(`day${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dayNum - 1]}-${containerId}`);
  const inputsDiv = document.getElementById(`day-${dayNum}-inputs-${containerId}`);
  if (checkbox.checked) {
    inputsDiv.style.display = 'flex';
  } else {
    inputsDiv.style.display = 'none';
  }
};

/* ---------- ADMIN: crear usuario ---------- */
window.createUser = async () => {
  const name = document.getElementById("newName").value.trim();
  const email = document.getElementById("newEmail").value.trim();
  const pass = document.getElementById("newPass").value;

  const workSchedule = {};
  for (let day = 1; day <= 7; day++) {
    const checkbox = document.getElementById(`day${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1]}-daysScheduleContainer`);
    if (checkbox && checkbox.checked) {
      const startHour = parseInt(document.getElementById(`day-${day}-startHour-daysScheduleContainer`).value) || 9;
      const startMinute = parseInt(document.getElementById(`day-${day}-startMinute-daysScheduleContainer`).value) || 0;
      const endHour = parseInt(document.getElementById(`day-${day}-endHour-daysScheduleContainer`).value) || 18;
      const endMinute = parseInt(document.getElementById(`day-${day}-endMinute-daysScheduleContainer`).value) || 0;
      if (startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
        endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
        showToast(`Horario inválido para ${dayNames[day - 1]}`, "warning");
        return;
      }
      workSchedule[day] = { startHour, startMinute, endHour, endMinute };
    }
  }

  const role = document.getElementById("newRole").value;

  const btn = document.getElementById("createBtn");
  const err = document.getElementById("createError");

  err.classList.remove("show");
  if (!name || !email || !pass) { err.textContent = "Completa todos los campos."; err.classList.add("show"); return; }
  if (pass.length < 6) { err.textContent = "Contraseña mínimo 6 caracteres."; err.classList.add("show"); return; }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    err.textContent = "No hay sesión activa."; err.classList.add("show"); return;
  }
  const currentUserDoc = await getDoc(doc(db, "usuarios", currentUser.uid));
  if (!currentUserDoc.exists() || currentUserDoc.data().role !== 'admin') {
    err.textContent = "No tienes permisos de administrador."; err.classList.add("show"); return;
  }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creando...';

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      uid: cred.user.uid,
      nombre: name,
      email,
      workSchedule: role === 'empleado' ? workSchedule : {},
      role,
      creadoEn: Timestamp.now()
    });

    showToast(`Cuenta creada: ${name} (${email}) como ${role}`, "success");

    document.getElementById("newName").value = "";
    document.getElementById("newEmail").value = "";
    document.getElementById("newPass").value = "";
    document.getElementById("newRole").value = "empleado";
    initDaysScheduleUI();

    await signOut(auth);
    showToast("Se cerró la sesión. Inicia como administrador nuevamente.", "info");
  } catch (e) {
    let m = "Error al crear usuario.";
    if (e.code === "auth/email-already-in-use") m = "Ese correo ya está registrado.";
    else if (e.code === "auth/invalid-email") m = "Correo no válido.";
    err.textContent = m; err.classList.add("show");
  } finally {
    btn.disabled = false; btn.innerHTML = "Crear cuenta";
  }
};

/* ---------- ADMIN: editar horario (modal) ---------- */
let currentEditingUserId = null;

window.openEditModal = (userId, userName, scheduleStr) => {
  currentEditingUserId = userId;
  document.getElementById("editUserName").textContent = userName;

  let schedule = {};
  try {
    schedule = typeof scheduleStr === 'string' ? JSON.parse(scheduleStr) : scheduleStr;
  } catch (e) {
    console.error("Error parseando schedule:", e);
    schedule = {};
  }

  initDaysScheduleUI("editDaysScheduleContainer", schedule);
  document.getElementById("editScheduleModal").classList.add("show");
};

window.closeEditModal = () => {
  document.getElementById("editScheduleModal").classList.remove("show");
  currentEditingUserId = null;
};

window.saveScheduleEdit = async () => {
  if (!currentEditingUserId) return;
  const workSchedule = {};
  for (let day = 1; day <= 7; day++) {
    const checkbox = document.getElementById(`day${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1]}-editDaysScheduleContainer`);
    if (checkbox && checkbox.checked) {
      const startHour = parseInt(document.getElementById(`day-${day}-startHour-editDaysScheduleContainer`).value) || 9;
      const startMinute = parseInt(document.getElementById(`day-${day}-startMinute-editDaysScheduleContainer`).value) || 0;
      const endHour = parseInt(document.getElementById(`day-${day}-endHour-editDaysScheduleContainer`).value) || 18;
      const endMinute = parseInt(document.getElementById(`day-${day}-endMinute-editDaysScheduleContainer`).value) || 0;
      if (startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
        endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
        showToast(`Horario inválido para ${dayNames[day - 1]}`, "warning");
        return;
      }
      workSchedule[day] = { startHour, startMinute, endHour, endMinute };
    }
  }

  try {
    await updateDoc(doc(db, "usuarios", currentEditingUserId), {
      workSchedule: workSchedule
    });
    showToast("Horario actualizado correctamente", "success");
    closeEditModal();
    loadUsers();
  } catch (e) {
    showToast("Error al guardar: " + e.message, "error");
  }
};

/* ---------- ADMIN: cargar usuarios ---------- */
async function loadUsers() {
  const list = document.getElementById("usersList");
  list.innerHTML = '<div class="loading-center" style="grid-column:1/-1">Cargando...</div>';
  try {
    const snap = await getDocs(collection(db, "usuarios"));
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👥</div><div class="empty-text">Sin usuarios aún</div><div class="empty-sub">Usa "Crear usuario" para agregar</div></div>`;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const u = d.data();
      let horario = '';
      if (u.role === 'admin') {
        horario = 'Administrador';
      } else {
        horario = formatWorkSchedule(u.workSchedule || {});
      }
      const avatarStyle = u.role === 'admin' ? 'background:linear-gradient(135deg,#f59e0b,#d97706);' : '';
      return `<div class="user-card">
        <div class="uc-avatar" style="${avatarStyle}">${ini(u.nombre)}</div>
        <div>
          <div class="uc-name">${esc(u.nombre)}</div>
          <div class="uc-email">${esc(u.email)}</div>
          <div class="user-schedule" style="color:${u.role === 'admin' ? '#f59e0b' : 'var(--primary)'};">${horario}</div>
        </div>
       <button class="edit-user-btn" onclick='openEditModal("${d.id}", "${esc(u.nombre)}", ${JSON.stringify(JSON.stringify(u.workSchedule || {}))})'>✏️</button>
      </div>`;
    }).join("");
  } catch (e) {
    list.innerHTML = `<div class="loading-center" style="grid-column:1/-1">Error: ${esc(e.message)}</div>`;
  }
}

/* ---------- TABS ---------- */
window.switchTab = (id, el) => {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("tab-" + id).classList.add("active");
  if (id === "usuarios") loadUsers();
  if (id === "asistencias") loadAttendance();
};

/* ---------- FILTROS ADMIN ---------- */
window.goToday = () => {
  document.getElementById("filterDate").value = todayStr();
  loadAttendance();
};
window.goYesterday = () => {
  document.getElementById("filterDate").value = yesterdayStr();
  loadAttendance();
};
window.goThisWeek = () => {
  showToast("Selecciona un rango manualmente (próximamente)", "info");
  document.getElementById("filterDate").value = todayStr();
  loadAttendance();
};

/* ---------- REGISTRO MANUAL DE ASISTENCIA ---------- */
let manualAttUID = null;
let manualAttSchedule = {};

window.openManualAttModal = (uid, nombre, workSchedule) => {
  manualAttUID = uid;
  manualAttSchedule = workSchedule;
  document.getElementById("manualAttName").textContent = nombre;
  document.getElementById("manualAttFecha").value = yesterdayStr();
  document.getElementById("manualAttFecha").max = todayStr();
  document.getElementById("manualAttEntrada").value = "09:00";
  document.getElementById("manualAttSalida").value = "";
  document.getElementById("manualAttError").classList.remove("show");
  document.getElementById("manualAttModal").classList.add("show");
};

window.closeManualAttModal = () => {
  document.getElementById("manualAttModal").classList.remove("show");
  manualAttUID = null;
  manualAttSchedule = {};
};

window.saveManualAttendance = async () => {
  const errEl = document.getElementById("manualAttError");
  errEl.classList.remove("show");

  const fecha = document.getElementById("manualAttFecha").value;
  const entradaVal = document.getElementById("manualAttEntrada").value;
  const salidaVal = document.getElementById("manualAttSalida").value;

  if (!fecha || !entradaVal) {
    errEl.textContent = "La fecha y hora de entrada son obligatorias.";
    errEl.classList.add("show");
    return;
  }
  if (!manualAttUID) return;

  // Verificar si ya existe registro para ese día
  const existing = await getDocs(query(
    collection(db, "asistencias"),
    where("uid", "==", manualAttUID),
    where("fecha", "==", fecha)
  ));
  if (!existing.empty) {
    errEl.textContent = "Ya existe un registro para esa fecha. Elimínalo primero si quieres reemplazarlo.";
    errEl.classList.add("show");
    return;
  }

  // Calcular lateMinutes
  const hora = entradaVal.length === 5 ? entradaVal + ":00" : entradaVal;
  let lateMinutes = 0;
  const fechaDate = new Date(fecha + "T00:00:00");
  let dayNum = fechaDate.getDay();
  dayNum = dayNum === 0 ? 7 : dayNum;
  const daySchedule = manualAttSchedule[dayNum];
  if (daySchedule) {
    const [hEnt, mEnt] = hora.split(":").map(Number);
    const entradaMinutos = hEnt * 60 + mEnt;
    const scheduledMinutos = daySchedule.startHour * 60 + daySchedule.startMinute;
    if (entradaMinutos > scheduledMinutos) {
      lateMinutes = entradaMinutos - scheduledMinutos;
    }
  }

  // Calcular exitMinutes si hay salida
  let exitMinutes = 0;
  let salidaHora = null;
  if (salidaVal) {
    salidaHora = salidaVal.length === 5 ? salidaVal + ":00" : salidaVal;
    if (daySchedule) {
      const [hSal, mSal] = salidaHora.split(":").map(Number);
      const salidaMinutos = hSal * 60 + mSal;
      const scheduledEndMinutos = daySchedule.endHour * 60 + daySchedule.endMinute;
      if (salidaMinutos < scheduledEndMinutos) {
        exitMinutes = scheduledEndMinutos - salidaMinutos; // positivo = salió antes (deuda)
      } else if (salidaMinutos > scheduledEndMinutos) {
        exitMinutes = -(salidaMinutos - scheduledEndMinutos); // negativo = hizo horas extra
      }
    }
  }

  try {
    const btn = document.querySelector("#manualAttModal .btn-primary");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Guardando...';

    const nombreEl = document.getElementById("manualAttName").textContent;
    const data = {
      uid: manualAttUID,
      nombre: nombreEl,
      fecha,
      hora,
      lateMinutes,
      exitMinutes,
      withinGeofence: true,
      registroManual: true,
      timestamp: Timestamp.fromDate(new Date(fecha + "T" + hora))
    };
    if (salidaHora) {
      data.salidaHora = salidaHora;
      data.salidaTimestamp = Timestamp.fromDate(new Date(fecha + "T" + salidaHora));
    }

    await addDoc(collection(db, "asistencias"), data);
    showToast(`Asistencia registrada para ${nombreEl} el ${fmtDate(fecha)}`, "success");
    closeManualAttModal();
    loadAttendance();
  } catch (e) {
    errEl.textContent = "Error al guardar: " + e.message;
    errEl.classList.add("show");
    const btn = document.querySelector("#manualAttModal .btn-primary");
    btn.disabled = false;
    btn.innerHTML = '💾 Guardar';
  }
};
