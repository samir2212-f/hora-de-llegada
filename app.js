import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
         createUserWithEmailAndPassword, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where,
         getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, Timestamp, arrayUnion }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- CONSTANTES ---------- */
const ADMIN_EMAIL  = "iaysoftwareliliput@gmail.com";
const PREVIEW_ROWS = 5;
const JORNADA_COMPLETA_MINUTOS = 9 * 60; // 540 minutos (de 9am a 6pm)
const FECHA_INICIO_SISTEMA = "2026-03-23"; // 📅 Lunes 23 de marzo de 2026 - El sistema empieza a contar desde aquí
// const LUNCH_END_HOUR = 14;   // Hora fija de fin de almuerzo (14:00) - COMENTADO

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

function startGeofenceWatch() {
  if (!navigator.geolocation) {
    document.getElementById("locationStatus").textContent = "Geolocalización no soportada";
    return;
  }
  const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      currentLocation = { lat: latitude, lng: longitude, accuracy };
      const distance = calculateDistance(latitude, longitude, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
      lastDistance = Math.round(distance);
      const within = distance <= OFFICE_LOCATION.radius;
      const btnEntrada = document.getElementById("checkBtn");
      const btnSalida = document.getElementById("exitBtn");
      // const btnLunchEnd = document.getElementById("lunchEndBtn"); // COMENTADO
      const statusEl = document.getElementById("locationStatus");
      if (within) {
        statusEl.textContent = `📍 Estás a ${lastDistance}m de la oficina (dentro del área)`;
        statusEl.style.color = "var(--success)";
        btnEntrada.disabled = false;
        btnSalida.disabled = false;
        // if (btnLunchEnd) btnLunchEnd.disabled = false; // COMENTADO
      } else {
        statusEl.textContent = `🌍 Estás a ${lastDistance}m de la oficina (fuera del área)`;
        statusEl.style.color = "var(--danger)";
        btnEntrada.disabled = true;
        btnSalida.disabled = true;
        // if (btnLunchEnd) btnLunchEnd.disabled = true; // COMENTADO
      }
      if (btnEntrada.style.display === "none") btnEntrada.disabled = true;
      if (btnSalida.style.display === "none") btnSalida.disabled = true;
      // if (btnLunchEnd && btnLunchEnd.style.display === "none") btnLunchEnd.disabled = true; // COMENTADO
    },
    (error) => {
      let msg = "Error de geolocalización: ";
      switch (error.code) {
        case error.PERMISSION_DENIED: msg += "Permiso denegado"; break;
        case error.POSITION_UNAVAILABLE: msg += "Ubicación no disponible"; break;
        case error.TIMEOUT: msg += "Tiempo de espera agotado"; break;
        default: msg += error.message;
      }
      document.getElementById("locationStatus").textContent = msg;
      document.getElementById("locationStatus").style.color = "var(--danger)";
      document.getElementById("checkBtn").disabled = true;
      document.getElementById("exitBtn").disabled = true;
      // const btnLunchEnd = document.getElementById("lunchEndBtn");
      // if (btnLunchEnd) btnLunchEnd.disabled = true; // COMENTADO
    },
    options
  );
}

function stopGeofenceWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    currentLocation = null;
  }
}

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

/* ---------- FUNCIÓN PARA OBTENER SALDO ACTUAL ---------- */
async function obtenerSaldoActual(uid) {
  try {
    const usuarioDoc = await getDoc(doc(db, "usuarios", uid));
    if (usuarioDoc.exists()) {
      return usuarioDoc.data().saldoTotal || 0;
    }
    return 0;
  } catch (error) {
    console.error("Error obteniendo saldo actual:", error);
    return 0;
  }
}

/* ---------- FUNCIÓN PARA ACTUALIZAR SALDO (SUMA A LO EXISTENTE) ---------- */
async function actualizarSaldoAcumulado(uid, nuevosMinutos, motivo = "") {
  try {
    // 1. Obtener el saldo actual de Firebase
    const usuarioRef = doc(db, "usuarios", uid);
    const usuarioDoc = await getDoc(usuarioRef);
    
    let saldoAnterior = 0;
    if (usuarioDoc.exists() && usuarioDoc.data().saldoTotal !== undefined) {
      saldoAnterior = usuarioDoc.data().saldoTotal;
    }
    
    // 2. Calcular el nuevo saldo (suma al anterior)
    const nuevoSaldo = saldoAnterior + nuevosMinutos;
    
    // 3. Guardar en Firebase (reemplaza el anterior con el nuevo acumulado)
    await updateDoc(usuarioRef, {
      saldoTotal: nuevoSaldo,
      ultimaActualizacionSaldo: Timestamp.now(),
      historialSaldo: arrayUnion({
        fecha: Timestamp.now(),
        minutos: nuevosMinutos,
        saldoAnterior: saldoAnterior,
        saldoNuevo: nuevoSaldo,
        motivo: motivo
      })
    });
    
    console.log(`💰 Saldo actualizado: ${saldoAnterior} + ${nuevosMinutos} = ${nuevoSaldo} (${motivo})`);
    
    return nuevoSaldo;
  } catch (error) {
    console.error("Error actualizando saldo acumulado:", error);
    return null;
  }
}

/* ---------- FUNCIÓN PARA CALCULAR MINUTOS NUEVOS (SIN ACUMULAR) ---------- */
async function calcularMinutosNuevos(uid, fechaInicio = null, fechaFin = null) {
  try {
    // Obtener datos del usuario
    const usuarioDoc = await getDoc(doc(db, "usuarios", uid));
    if (!usuarioDoc.exists()) return 0;
    
    const usuario = usuarioDoc.data();
    if (usuario.role === 'admin') return 0;

    // Usar la fecha fija de inicio del sistema
    if (!fechaInicio) {
      fechaInicio = FECHA_INICIO_SISTEMA;
    }
    
    if (!fechaFin) {
      fechaFin = todayStr();
    }
    
    console.log(`📅 Calculando MINUTOS NUEVOS para ${usuario.nombre} desde ${fechaInicio} hasta ${fechaFin}`);

    // Obtener la última fecha de cálculo para no duplicar
    const ultimaFechaCalculo = usuario.ultimaFechaCalculo || fechaInicio;
    
    // Si ya se calculó hasta hoy, no hacer nada
    if (ultimaFechaCalculo >= fechaFin) {
      console.log("⏭️ Ya se calculó hasta hoy, no hay minutos nuevos");
      return 0;
    }
    
    // Calcular desde la última fecha hasta hoy
    let inicioCalc = ultimaFechaCalculo > fechaInicio ? ultimaFechaCalculo : fechaInicio;
    
    // Si la última fecha es igual a la fecha de inicio, no avanzamos
    if (inicioCalc === fechaInicio && ultimaFechaCalculo !== fechaInicio) {
      inicioCalc = fechaInicio;
    }

    console.log(`🔍 Calculando desde ${inicioCalc} hasta ${fechaFin}`);

    // Obtener asistencias del usuario
    const asistenciasQuery = query(
      collection(db, "asistencias"),
      where("uid", "==", uid)
    );
    const asistenciasSnap = await getDocs(asistenciasQuery);
    
    const asistenciasMap = new Map();
    asistenciasSnap.forEach(doc => {
      const data = doc.data();
      asistenciasMap.set(data.fecha, data);
    });

    let minutosNuevos = 0;
    let diasProcesados = 0;
    let faltasNuevas = 0;
    let extrasNuevos = 0;

    // Recorrer días NO procesados
    const fechaInicioCalc = new Date(inicioCalc);
    const fechaFinCalc = new Date(fechaFin);
    
    for (let d = new Date(fechaInicioCalc); d <= fechaFinCalc; d.setDate(d.getDate() + 1)) {
      const fechaStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      let dayNum = d.getDay();
      dayNum = dayNum === 0 ? 7 : dayNum;

      const diaLaboral = usuario.workSchedule?.[dayNum];
      if (!diaLaboral) continue;
      
      diasProcesados++;
      
      const asistencia = asistenciasMap.get(fechaStr);

      if (asistencia) {
        // Día trabajado: sumar late/exit
        const minutosDia = (asistencia.lateMinutes || 0) + (asistencia.exitMinutes || 0);
        minutosNuevos += minutosDia;
        console.log(`📊 ${fechaStr}: +${minutosDia} min (trabajado)`);
      } else {
        // Falta: sumar jornada completa
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fechaComparar = new Date(d);
        fechaComparar.setHours(0, 0, 0, 0);
        
        if (fechaComparar < hoy) {
          minutosNuevos += JORNADA_COMPLETA_MINUTOS;
          faltasNuevas++;
          console.log(`⚡ ${fechaStr}: +${JORNADA_COMPLETA_MINUTOS} min (falta)`);
        }
      }
    }

    // Días extras (trabajados en días no laborables)
    for (const [fechaStr, asistencia] of asistenciasMap.entries()) {
      if (fechaStr < inicioCalc || fechaStr > fechaFin) continue;
      if (!asistencia.hora || !asistencia.salidaHora) continue;
      if (asistencia.hora === '--:--:--' || asistencia.salidaHora === '--:--:--') continue;
      
      const fecha = new Date(fechaStr);
      let dayNum = fecha.getDay();
      dayNum = dayNum === 0 ? 7 : dayNum;
      
      const diaLaboral = usuario.workSchedule?.[dayNum];
      
      if (!diaLaboral) {
        const [hEnt, mEnt] = asistencia.hora.split(':').map(Number);
        const [hSal, mSal] = asistencia.salidaHora.split(':').map(Number);
        
        const minutosTrabajados = (hSal * 60 + mSal) - (hEnt * 60 + mEnt);
        
        if (minutosTrabajados > 0) {
          minutosNuevos -= minutosTrabajados;
          extrasNuevos++;
          console.log(`⭐ ${fechaStr}: -${minutosTrabajados} min (extra)`);
        }
      }
    }

    // Guardar la última fecha calculada
    await updateDoc(doc(db, "usuarios", uid), {
      ultimaFechaCalculo: fechaFin
    });

    console.log(`🎯 Minutos nuevos calculados: ${minutosNuevos} (días: ${diasProcesados}, faltas: ${faltasNuevas}, extras: ${extrasNuevos})`);
    
    return minutosNuevos;

  } catch (error) {
    console.error("Error calculando minutos nuevos:", error);
    return 0;
  }
}

/* ---------- FUNCIÓN PARA ACTUALIZAR UI CON SALDO ACUMULADO ---------- */
async function actualizarSaldoEnUI(uid) {
  try {
    // 1. Obtener el saldo actual de Firebase
    const saldoActual = await obtenerSaldoActual(uid);
    
    // 2. Calcular minutos nuevos desde la última vez
    const minutosNuevos = await calcularMinutosNuevos(uid);
    
    // 3. Si hay minutos nuevos, actualizar el saldo acumulado
    let saldoFinal = saldoActual;
    if (minutosNuevos !== 0) {
      saldoFinal = await actualizarSaldoAcumulado(uid, minutosNuevos, "Cálculo automático");
    } else {
      saldoFinal = saldoActual;
    }
    
    // 4. Mostrar en UI
    const saldoElement = document.getElementById("totalLateMinutes");
    if (saldoElement) {
      saldoElement.textContent = saldoFinal;
      
      if (saldoFinal > 0) {
        saldoElement.style.color = "var(--danger)";
        saldoElement.parentElement.style.background = "var(--danger-l)";
        saldoElement.parentElement.title = "Tienes minutos acumulados por faltas o tardanzas";
      } else if (saldoFinal < 0) {
        saldoElement.style.color = "var(--success)";
        saldoElement.parentElement.style.background = "var(--success-l)";
        saldoElement.textContent = saldoFinal;
        saldoElement.parentElement.title = "Tienes minutos a favor por días extras trabajados";
      } else {
        saldoElement.style.color = "var(--warning)";
        saldoElement.parentElement.style.background = "var(--warning-l)";
        saldoElement.parentElement.title = "Saldo neutro";
      }
    }
    
    return saldoFinal;
  } catch (error) {
    console.error("Error actualizando saldo en UI:", error);
    // Fallback: mostrar 0
    document.getElementById("totalLateMinutes").textContent = "0";
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

  // 👇 Usar nueva función que acumula
  await actualizarSaldoEnUI(user.uid);
}

/* ---------- CALCULAR TOTAL MINUTOS TARDE (saldo) - MANTENIDO POR COMPATIBILIDAD ---------- */
async function updateTotalLateMinutes(uid) {
  try {
    const q = query(collection(db, "asistencias"), where("uid", "==", uid));
    const snap = await getDocs(q);
    let total = 0;
    snap.forEach(doc => {
      const data = doc.data();
      if (data.lateMinutes) total += data.lateMinutes;
      if (data.exitMinutes) total += data.exitMinutes;
      // if (data.lunchExtraMinutes) total += data.lunchExtraMinutes; // COMENTADO
    });
    document.getElementById("totalLateMinutes").textContent = total;
  } catch (e) {
    console.error("Error calculando minutos tarde:", e);
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
      creadoEn: Timestamp.now(),
      saldoTotal: 0,
      ultimaFechaCalculo: FECHA_INICIO_SISTEMA
    });
    userDoc = await getDoc(doc(db, "usuarios", user.uid));
  } else {
    // Asegurar que existan los campos de saldo
    if (userDoc.data().saldoTotal === undefined) {
      await updateDoc(doc(db, "usuarios", user.uid), {
        saldoTotal: 0,
        ultimaFechaCalculo: FECHA_INICIO_SISTEMA
      });
    }
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

  initDaysScheduleUI(); // para crear usuario
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

/* ---------- CHECK TODAY (entrada/salida) ---------- */
async function checkToday(user) {
  const q = query(collection(db, "asistencias"),
    where("uid", "==", user.uid), where("fecha", "==", todayStr()));
  const snap = await getDocs(q);
  const btnEntrada = document.getElementById("checkBtn");
  const btnSalida = document.getElementById("exitBtn");
  // const lunchButtonContainer = document.getElementById("lunchButtonContainer"); // COMENTADO
  // const lunchEndBtn = document.getElementById("lunchEndBtn"); // COMENTADO
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
      // lunchButtonContainer.style.display = "none"; // COMENTADO
      estado += ` · Salida: ${docData.salidaHora}`;
    } else {
      btnSalida.style.display = "block";
    }

    alreadyTime.textContent = estado;
  } else {
    btnEntrada.style.display = "block";
    btnSalida.style.display = "none";
    // lunchButtonContainer.style.display = "none"; // COMENTADO
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

    const docRef = await addDoc(collection(db, "asistencias"), {
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

    window.currentAttendanceDocId = docRef.id;

    showToast("Entrada registrada correctamente", "success");

    // 👇 Actualizar saldo acumulado
    await actualizarSaldoEnUI(user.uid);

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
    // document.getElementById("lunchButtonContainer").style.display = "none"; // COMENTADO
    document.getElementById("alreadyTime").textContent += ` · Salida: ${horaSalida}`;

    showToast("Salida registrada correctamente", "success");

    // 👇 Actualizar saldo acumulado
    await actualizarSaldoEnUI(user.uid);

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

    let html = '<table class="history-table"><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Min</th></tr>';
    registros.forEach(r => {
      const entrada = r.hora || '—';
      const salida = r.salidaHora || '—';
      const minutos = (r.lateMinutes || 0) + (r.exitMinutes || 0);
      html += `<tr><td>${fmtDate(r.fecha)}</td><td>${entrada}</td><td>${salida}</td><td>${minutos}</td></tr>`;
    });
    html += '</table>';
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
        ${deleteBtn}
      </div>
    </div>
    <div class="eac-body" id="eac-body-${user.id}">
      <div class="loading-center" style="padding:20px;">Cargando historial reciente...</div>
    </div>
  `;

  // 👇 Agregar badge de saldo acumulado
  if (user.role !== 'admin') {
    const saldoActual = await obtenerSaldoActual(user.id);
    const badgeContainer = card.querySelector('.eac-today-badge');
    if (badgeContainer) {
      const saldoBadge = document.createElement('span');
      saldoBadge.className = 'mini-badge';
      saldoBadge.style.background = saldoActual > 0 ? 'var(--danger-l)' : (saldoActual < 0 ? 'var(--success-l)' : 'var(--warning-l)');
      saldoBadge.style.color = saldoActual > 0 ? 'var(--danger)' : (saldoActual < 0 ? 'var(--success)' : 'var(--warning)');
      saldoBadge.innerHTML = `💰 ${saldoActual > 0 ? '+' : ''}${saldoActual} min`;
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

    let html = `<table>
      <tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Min</th><th></th></tr>`;
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
        <td>${minutos}</td>
        <td style="text-align:right;">
          ${locationIcon}
          <span class="delete-att" data-id="${r.id}" data-uid="${uid}" data-fecha="${r.fecha}">🗑️</span>
        </td>
      </tr>`;
    });
    html += '</table>';

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

    let html = `<table>
      <tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Min</th><th></th></tr>`;
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
        <td>${minutos}</td>
        <td style="text-align:right;">
          ${locationIcon}
          <span class="delete-att" data-id="${r.id}" data-uid="${uid}" data-fecha="${r.fecha}">🗑️</span>
        </td>
      </tr>`;
    });
    html += '</table>';
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
      await actualizarSaldoEnUI(uid);
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
      creadoEn: Timestamp.now(),
      saldoTotal: 0,
      ultimaFechaCalculo: FECHA_INICIO_SISTEMA
    });

    showToast(`Cuenta creada: ${name} (${email}) como ${role}`, "success");

    document.getElementById("newName").value = "";
    document.getElementById("newEmail").value = "";
    document.getElementById("newPass").value = "";
    document.getElementById("newRole").value = "empleado";
    // Reiniciar checkboxes
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

  // Parsear el schedule si viene como string
  let schedule = {};
  try {
    schedule = typeof scheduleStr === 'string' ? JSON.parse(scheduleStr) : scheduleStr;
  } catch (e) {
    console.error("Error parseando schedule:", e);
    schedule = {};
  }

  // Inicializar el modal con el horario actual
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
    loadUsers(); // recargar lista
  } catch (e) {
    showToast("Error al guardar: " + e.message, "error");
  }
};

/* ---------- ADMIN: cargar usuarios (con botón de editar) ---------- */
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
      
      // Obtener saldo actual
      const saldoActual = u.saldoTotal || 0;
      const saldoColor = saldoActual > 0 ? '#e02424' : (saldoActual < 0 ? '#0d9f6e' : '#d97706');
      
      return `<div class="user-card">
        <div class="uc-avatar" style="${avatarStyle}">${ini(u.nombre)}</div>
        <div>
          <div class="uc-name">${esc(u.nombre)}</div>
          <div class="uc-email">${esc(u.email)}</div>
          <div class="user-schedule" style="color:${u.role === 'admin' ? '#f59e0b' : 'var(--primary)'};">${horario}</div>
          <div class="user-schedule" style="color:${saldoColor}; font-weight:bold;">💰 Saldo: ${saldoActual > 0 ? '+' : ''}${saldoActual} min</div>
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