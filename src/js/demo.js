/**
 * @file demo.js
 * @description Modo demo (integrations.demoLogin): un cliente Supabase falso
 * con datos de ejemplo, para enseñar la app sin backend.
 *
 * El build solo copia este fichero (y lo carga en el <head> de cada página)
 * cuando la comunidad tiene `integrations.demoLogin: true`. auth.js lo usa en
 * getSupabase() en lugar del cliente real.
 *
 *  - Lecturas: select / eq / gte / order / limit / single… sobre tablas en memoria.
 *  - Escrituras (inscribirse, preguntar al rav…): se guardan en este navegador
 *    (localStorage `kehila_demo_db`) y se reinician cada día, para que las
 *    fechas de ejemplo sigan siendo futuras.
 *  - Subidas de archivos, pagos y funciones edge: devuelven un error amable.
 *
 * Todo es ficticio: nombres inventados, dominios example.com, teléfonos +34 600 000 0xx.
 */
(function () {
  'use strict';

  const DB_KEY = 'kehila_demo_db';
  const SEED_VERSION = 3;   // subir al cambiar seed(): descarta lo guardado en los navegadores
  const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000';
  const NO_DISPONIBLE = { message: 'No disponible en la demo', code: 'demo' };

  // ─── Fechas relativas a hoy ─────────────────
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dia = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
  const hace = (dias, hora = 10) => { const d = new Date(); d.setDate(d.getDate() - dias); d.setHours(hora, 0, 0, 0); return d.toISOString(); };
  /** Próximo día de la semana (0 = domingo … 5 = viernes) a partir de hoy + desde (1 = nunca hoy: el evento podría haber pasado ya). */
  const proximo = (dow, desde = 0) => { const d = new Date(); d.setDate(d.getDate() + desde); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return ymd(d); };

  // ─── Imágenes: ilustraciones SVG con los colores de la comunidad ──
  // Los hex de marca (#1B2E5E, #C9A84C) los cambia el build por el tema de cada comunidad.
  const ICONOS = {
    vela: '<path d="M0-38c6 9 6 15 0 20-6-5-6-11 0-20z" fill="#C9A84C"/><rect x="-7" y="-14" width="14" height="52" rx="3" fill="#fff" opacity=".9"/>',
    libro: '<path d="M-44-26h38c4 0 6 3 6 6v50c0-3-2-6-6-6h-38zM44-26H6c-4 0-6 3-6 6v50c0-3 2-6 6-6h38z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>',
    estrella: '<path d="M0-42 36 21H-36zM0 42-36-21H36z" fill="none" stroke="#C9A84C" stroke-width="5" stroke-linejoin="round"/>',
    copa: '<path d="M-24-34h48c0 26-10 40-24 40S-24-8-24-34zM0 6v26M-16 34h32" fill="none" stroke="#C9A84C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    jala: '<ellipse cx="0" cy="6" rx="46" ry="22" fill="#C9A84C"/><path d="M-30 6c8-14 16-14 22 0M-8 6c8-14 16-14 22 0M14 6c6-12 12-12 16 0" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/>',
    personas: '<circle cx="-22" cy="-16" r="12" fill="#fff"/><circle cx="22" cy="-16" r="12" fill="#fff"/><circle cx="0" cy="-24" r="14" fill="#C9A84C"/><path d="M-44 30c0-20 10-30 22-30s22 10 22 30zM0 30c0-20 10-30 22-30s22 10 22 30z" fill="#fff" opacity=".85"/><path d="M-24 30c0-24 10-36 24-36s24 12 24 36z" fill="#C9A84C"/>',
    musica: '<path d="M-12 26V-30l40-10v52" fill="none" stroke="#fff" stroke-width="5"/><circle cx="-20" cy="26" r="10" fill="#C9A84C"/><circle cx="20" cy="14" r="10" fill="#C9A84C"/>',
    hoja: '<path d="M-30 30C-30-20 10-40 36-40c0 30-20 70-66 70zM-30 30 20-20" fill="none" stroke="#C9A84C" stroke-width="5" stroke-linecap="round"/>',
    corazon: '<path d="M0 34S-40 10-40-14c0-12 9-20 20-20 9 0 16 6 20 14 4-8 11-14 20-14 11 0 20 8 20 20C40 10 0 34 0 34z" fill="#C9A84C"/>',
    tienda: '<path d="M-40-10h80l-8-24h-64zM-34-10v42h68v-42" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><rect x="-10" y="8" width="20" height="24" fill="#C9A84C"/>',
  };
  function arte(icono, variante = 0, texto = '') {
    const fondos = [['#1B2E5E', '#2a4785'], ['#14223f', '#1B2E5E'], ['#1B2E5E', '#3b5998'], ['#0f1a36', '#C9A84C']];
    const [a, b] = fondos[variante % fondos.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="800" height="500" fill="url(#g)"/>
      <circle cx="680" cy="80" r="160" fill="#fff" opacity=".05"/><circle cx="90" cy="440" r="120" fill="#fff" opacity=".05"/>
      <g transform="translate(400 ${texto ? 220 : 250}) scale(2.2)">${ICONOS[icono] || ICONOS.estrella}</g>
      ${texto ? `<text x="400" y="420" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#fff" opacity=".9">${texto}</text>` : ''}
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function logo(iniciales, variante = 0) {
    const c = ['#1B2E5E', '#C9A84C', '#2a4785', '#0f1a36'][variante % 4];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="40" fill="${c}"/><text x="100" y="124" text-anchor="middle" font-family="Georgia,serif" font-size="72" font-weight="700" fill="#fff">${iniciales}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ─── Datos de ejemplo ───────────────────────
  function seed() {
    const ev = (id, titulo, fecha, hora, lugar, categoria, icono, variante, extra = {}) => ({
      id, titulo, fecha, hora, lugar, categoria, aforo: 60, precio: 0, subgrupo_id: null,
      imagen_url: arte(icono, variante), mensaje_inscripcion: '¡Te esperamos! Recibirás un recordatorio el día antes.',
      created_at: hace(10), ...extra,
    });
    const eventos = [
      ev('ev-1', 'Cena de Shabat comunitaria', proximo(5, 1), '20:00', 'Salón principal', 'Shabat', 'jala', 0, {
        imagen_url: 'img/demo/evento-cena-shabat.jpg',
        descripcion: 'Una cena de Shabat para toda la comunidad: kidush, jalot caseras, menú de tres platos y canciones. Ideal para conocer a nuevas familias.',
        aforo: 80, precio: 25 }),
      ev('ev-2', 'Shiur semanal de Parashá', proximo(4, 1), '19:30', 'Sala de estudio', 'Estudio', 'libro', 1, {
        imagen_url: 'img/demo/evento-shiur-parasha.jpg',
        descripcion: 'Estudio de la porción semanal con preguntas abiertas y debate. No hace falta conocimiento previo.', aforo: 30 }),
      ev('ev-3', 'Taller de jalot para familias', proximo(0, 9), '11:00', 'Cocina comunitaria', 'Educación', 'jala', 2, {
        descripcion: 'Aprende a trenzar jalot con tus hijos. Incluye ingredientes, delantal y una jalá para llevar a casa.', aforo: 24 }),
      ev('ev-4', 'Concierto de música jasídica', dia(16), '20:30', 'Auditorio del centro', 'Cultura', 'musica', 3, {
        descripcion: 'Una noche de niguním y música en directo con un trío de clarinete, violín y piano.', aforo: 120 }),
      ev('ev-5', 'Encuentro de jóvenes profesionales', dia(9), '19:00', 'Terraza del centro', 'Comunidad', 'personas', 0, {
        descripcion: 'Networking informal para jóvenes de 22 a 35 años, con picoteo kosher y una charla breve.', aforo: 50 }),
      ev('ev-6', 'Celebración de Tu Bishvat', dia(23), '18:00', 'Jardín del centro', 'Festividad', 'hoja', 1, {
        descripcion: 'Séder de frutos con las siete especies, actividades para niños y plantación simbólica.', aforo: 100 }),
      ev('ev-7', 'Clase de hebreo para principiantes', proximo(2, 1), '19:30', 'Aula 2', 'Educación', 'libro', 2, {
        imagen_url: 'img/demo/evento-clase-hebreo.jpg',
        descripcion: 'Primer módulo de hebreo conversacional: alefato, saludos y frases útiles del día a día.', aforo: 15 }),
    ];

    const noticias = [
      { id: 'n-1', titulo: 'Abrimos inscripciones para la cena de Shabat comunitaria', categoria: 'comunidad', autor: 'Secretaría',
        excerpt: 'Más de 80 plazas, menú de tres platos y un ambiente familiar. Reserva tu sitio desde la sección de eventos.',
        contenido: 'Este viernes celebramos una nueva cena de Shabat comunitaria en el salón principal.\n\nHabrá kidush, jalot caseras, un menú de tres platos preparado bajo supervisión y un rato de canciones al final. Es una ocasión ideal para conocer a las familias que se han unido en los últimos meses.\n\nLas plazas son limitadas: inscríbete desde la sección de eventos de la app.',
        fecha: dia(-1), created_at: hace(1), imagen_url: arte('jala', 0), tiempoLectura: '2 min' },
      { id: 'n-2', titulo: 'Nuevo horario de tefilot durante el invierno', categoria: 'comunidad', autor: 'Secretaría',
        excerpt: 'Con el cambio de hora ajustamos Minjá y Arvit. Consulta los nuevos horarios en la página de inicio.',
        contenido: 'A partir de esta semana, Minjá y Arvit se adelantan para adaptarse a la puesta de sol de invierno.\n\nLos horarios actualizados están siempre en la página de inicio de la app, en el apartado de horarios de la sinagoga.',
        fecha: dia(-4), created_at: hace(4), imagen_url: arte('vela', 1), tiempoLectura: '1 min' },
      { id: 'n-3', titulo: '¿Cómo kasherizar la cocina después de una mudanza?', categoria: 'kashrut', autor: 'Rabinato',
        excerpt: 'Una guía práctica, paso a paso, para preparar una cocina nueva según la halajá.',
        contenido: 'Mudarse a una casa nueva es un buen momento para revisar la kashrut de la cocina.\n\nEn este artículo repasamos qué utensilios se pueden kasherizar, cuáles conviene sustituir y cómo organizar los espacios de carne y leche.\n\nSi tienes dudas concretas, puedes preguntar al rabino desde la sección «Pregunta al Rav».',
        fecha: dia(-7), created_at: hace(7), imagen_url: arte('copa', 2), tiempoLectura: '5 min' },
      { id: 'n-4', titulo: 'Las leyes de Shabat en la vida moderna', categoria: 'halacha', autor: 'Rabinato',
        excerpt: 'Ascensores, luces automáticas y teléfonos: respuestas a las preguntas más frecuentes.',
        contenido: 'Cada semana recibimos preguntas sobre cómo aplicar las leyes de Shabat a la tecnología actual.\n\nHemos recopilado las más frecuentes con respuestas claras y fuentes para quien quiera profundizar.',
        fecha: dia(-12), created_at: hace(12), imagen_url: arte('vela', 3), tiempoLectura: '4 min' },
      { id: 'n-5', titulo: 'Gran éxito del festival de Janucá', categoria: 'evento', autor: 'Equipo de eventos',
        excerpt: 'Más de 300 personas encendieron con nosotros la última vela. ¡Gracias a todos los voluntarios!',
        contenido: 'El festival de Janucá reunió a más de 300 personas en la plaza del centro.\n\nHubo sufganiot, música en directo y talleres para los más pequeños. Gracias a todos los voluntarios que lo hicieron posible.',
        fecha: dia(-20), created_at: hace(20), imagen_url: arte('estrella', 0), tiempoLectura: '2 min' },
      { id: 'n-6', titulo: 'Misión solidaria a Israel: abiertas las plazas', categoria: 'israel', autor: 'Secretaría',
        excerpt: 'Una semana de voluntariado y visitas. Plazas limitadas para mayores de 18 años.',
        contenido: 'Organizamos una misión solidaria de una semana a Israel con actividades de voluntariado, visitas y encuentros.\n\nLas plazas son limitadas; escríbenos desde la sección de contacto para recibir el programa completo.',
        fecha: dia(-26), created_at: hace(26), imagen_url: arte('estrella', 2), tiempoLectura: '3 min' },
    ];

    const negocio = (id, nombre, categoria, descripcion, extra = {}) => ({
      id, nombre, categoria, descripcion, ciudad: 'Madrid', direccion: '', telefono: '', email: '', web: '',
      propietario: 'Miembro de la comunidad', kosher: false, cierra_shabat: false, verificado: true,
      usuario_id: null, created_at: hace(30), ...extra,
    });
    const negocios = [
      negocio('b-1', 'Panadería Shalom', 'Alimentación', 'Jalot, rugelaj y bollería kosher parve horneada cada mañana. Encargos para Shabat hasta el jueves.', {
        direccion: 'Calle de Ejemplo, 12', telefono: '+34 600 000 011', email: 'hola@panaderia.example.com', kosher: true, cierra_shabat: true, logo_url: logo('PS', 1) }),
      negocio('b-2', 'Restaurante Jerusalén', 'Hostelería', 'Cocina mediterránea e israelí bajo supervisión. Menú del día, comida para llevar y catering para eventos.', {
        direccion: 'Avenida de Muestra, 45', telefono: '+34 600 000 012', web: 'https://restaurante.example.com', kosher: true, cierra_shabat: true, logo_url: logo('RJ', 0) }),
      negocio('b-3', 'Asesoría Levi & Asociados', 'Legal', 'Derecho de familia, sucesiones y extranjería. Primera consulta gratuita para miembros de la comunidad.', {
        direccion: 'Plaza Ficticia, 3', telefono: '+34 600 000 013', email: 'contacto@asesoria.example.com', logo_url: logo('LA', 2) }),
      negocio('b-4', 'Clínica Dental Sonrisa', 'Médico', 'Odontología general, ortodoncia e implantes. Descuento del 10 % para familias de la comunidad.', {
        direccion: 'Calle Inventada, 8', telefono: '+34 600 000 014', logo_url: logo('DS', 3) }),
      negocio('b-5', 'Hogar Inmobiliaria', 'Inmobiliaria', 'Compra, venta y alquiler cerca de la sinagoga. Te ayudamos a encontrar casa a distancia caminando.', {
        telefono: '+34 600 000 015', web: 'https://hogar.example.com', logo_url: logo('HI', 0) }),
      negocio('b-6', 'Código Kodesh', 'Tecnología', 'Desarrollo web y apps para pequeños negocios y entidades. Webs, tiendas online y mantenimiento.', {
        email: 'hola@codigo.example.com', web: 'https://codigo.example.com', logo_url: logo('CK', 2) }),
      negocio('b-7', 'Academia Alef', 'Educación', 'Clases particulares de hebreo, matemáticas e inglés para todas las edades. Online o presencial.', {
        telefono: '+34 600 000 017', logo_url: logo('AA', 1) }),
    ];

    const shiur = (id, apartado, titulo, maestro, dias, duracion, icono, variante, extra = {}) => ({
      id, apartado, titulo, maestro, fecha: dia(-dias), duracion, imagen_url: arte(icono, variante),
      video_url: '', likes: 12 + dias * 3, vistas: 140 + dias * 37, created_at: hace(dias), ...extra,
    });
    const shiurim = [
      shiur('s-1', 'videos', 'La parashá de la semana en 15 minutos', 'Rav Demo', 2, '15:20', 'libro', 0),
      shiur('s-2', 'videos', 'Introducción a las bendiciones de los alimentos', 'Rav Demo', 6, '22:05', 'copa', 1),
      shiur('s-3', 'videos', 'Preparar Shabat sin estrés', 'Rabanit Demo', 11, '18:40', 'vela', 2),
      shiur('s-4', 'videos', 'Historia de las comunidades sefardíes', 'Prof. Invitado', 17, '41:10', 'estrella', 3),
      shiur('s-5', 'hoja_semana', 'Hoja semanal: ideas para la mesa de Shabat', 'Rav Demo', 3, '9:30', 'jala', 1),
      shiur('s-6', 'hoja_semana', 'Hoja semanal: jaguim y tradiciones', 'Rav Demo', 10, '11:45', 'hoja', 0),
    ];

    const fotos = [
      ['jala', 'Shabat', 'Cena de Shabat'], ['musica', 'Eventos', 'Concierto de primavera'], ['estrella', 'Janucá', 'Encendido en la plaza'],
      ['personas', 'Eventos', 'Encuentro de familias'], ['libro', 'Estudio', 'Shiur de los martes'], ['vela', 'Shabat', 'Velas de Shabat'],
      ['hoja', 'Eventos', 'Tu Bishvat en el jardín'], ['copa', 'Shabat', 'Kidush comunitario'], ['corazon', 'Voluntariado', 'Reparto solidario'],
    ].map(([icono, album, titulo], i) => ({
      id: 'f-' + (i + 1), album, titulo, descripcion: '', storage_path: arte(icono, i, titulo), created_at: hace(i * 4 + 2),
    }));

    const calendario_eventos = [
      { id: 'c-1', fecha: dia(5), hora: '10:00', titulo: 'Reunión de la junta', descripcion: 'Reunión mensual abierta a socios.', lugar: 'Sala de juntas', tipo: 'comunidad' },
      { id: 'c-2', fecha: dia(12), hora: '17:30', titulo: 'Talmud Torah: entrega de notas', descripcion: '', lugar: 'Aulas', tipo: 'comunidad' },
      { id: 'c-3', fecha: dia(19), hora: '12:00', titulo: 'Bar Mitzvá en la sinagoga', descripcion: '¡Mazal tov a la familia!', lugar: 'Sinagoga', tipo: 'comunidad' },
    ];

    const preguntas_rav = [
      { id: 'q-1', usuario_id: DEMO_USER_ID, usuario_nombre: 'Usuario Demo', categoria: 'Shabat', estado: 'respondida', publica: true,
        pregunta: '¿Se puede dejar una luz con temporizador encendida durante Shabat?',
        respuesta: 'Sí, siempre que el temporizador se programe antes de que empiece Shabat y no se modifique después. Es una solución muy habitual.',
        created_at: hace(9), updated_at: hace(8) },
      { id: 'q-2', usuario_id: DEMO_USER_ID, usuario_nombre: 'Usuario Demo', categoria: 'Kashrut', estado: 'pendiente', publica: false,
        pregunta: '¿Qué hechsher es fiable para el chocolate que se vende en supermercados?', respuesta: null, created_at: hace(1) },
    ];

    return {
      eventos, noticias, negocios, shiurim, fotos, calendario_eventos, preguntas_rav,
      subgrupos: [],
      inscripciones: [
        { id: 'i-1', evento_id: 'ev-2', usuario_id: DEMO_USER_ID, created_at: hace(2) },
        ...Array.from({ length: 34 }, (_, i) => ({ id: 'i-x' + i, evento_id: ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5'][i % 5], usuario_id: 'otro-' + i, created_at: hace(3) })),
      ],
      horarios: [{ id: 'sinagoga', items: [
        { nombre: 'Shajarit', hora: '07:30', tipo: 'semana' }, { nombre: 'Minjá', hora: '17:45', tipo: 'semana' },
        { nombre: 'Arvit', hora: '18:15', tipo: 'semana' }, { nombre: 'Kabalat Shabat', hora: '18:00', tipo: 'shabat' },
        { nombre: 'Shajarit de Shabat', hora: '09:30', tipo: 'shabat' }, { nombre: 'Havdalá', hora: '19:05', tipo: 'shabat' },
      ] }],
      banner_slides: [
        { id: 'bs-1', tipo: 'fotos_comunidad', activo: true, orden: 1, imagen_url: arte('jala', 0) },
        { id: 'bs-2', tipo: 'fotos_comunidad', activo: true, orden: 2, imagen_url: arte('personas', 1) },
        { id: 'bs-3', tipo: 'fotos_comunidad', activo: true, orden: 3, imagen_url: arte('musica', 2) },
        { id: 'bs-4', tipo: 'fotos_comunidad', activo: true, orden: 4, imagen_url: arte('estrella', 3) },
      ],
      // Solo imagen: los textos de cada área ya vienen en donativos.html
      don_areas: [
        { id: 'educativo', imagen_url: arte('libro', 0) },
        { id: 'religioso', imagen_url: arte('vela', 1) },
        { id: 'social', imagen_url: arte('corazon', 2) },
        { id: 'israel', imagen_url: arte('estrella', 3) },
      ],
      donaciones: [
        { id: 'd-1', usuario_id: DEMO_USER_ID, usuario_nombre: 'Usuario Demo', campana_nombre: 'Fondo general', cantidad: 36, recurrente: false, created_at: hace(15) },
        { id: 'd-2', usuario_id: DEMO_USER_ID, usuario_nombre: 'Usuario Demo', campana_nombre: 'Ayuda social', cantidad: 18, recurrente: true, created_at: hace(45) },
      ],
      citas: [
        { id: 'ci-1', usuario_id: DEMO_USER_ID, tipo_cita: 'Consulta personal', tipo_emoji: '💬', modalidad: 'presencial', estado: 'confirmada', created_at: hace(3) },
      ],
      mikve_reservas: [
        { id: 'mk-1', usuario_id: DEMO_USER_ID, fecha: dia(6), hora: '20:30', servicio: 'mujer', estado: 'confirmada', notas: '', total: 0, created_at: hace(1) },
      ],
      notif_buzon: [
        { id: 'nb-1', user_id: DEMO_USER_ID, tipo: 'evento', titulo: 'Nuevo evento: Cena de Shabat comunitaria', cuerpo: 'Ya puedes inscribirte. Plazas limitadas.', url: 'eventos.html', leida: false, created_at: hace(0, 9) },
        { id: 'nb-2', user_id: DEMO_USER_ID, tipo: 'rav', titulo: 'El rabino ha respondido a tu pregunta', cuerpo: '¿Se puede dejar una luz con temporizador…?', url: 'rav.html', leida: false, created_at: hace(8) },
        { id: 'nb-3', user_id: DEMO_USER_ID, tipo: 'noticia', titulo: 'Nuevo horario de tefilot', cuerpo: 'Consulta los horarios de invierno.', url: 'home.html', leida: true, created_at: hace(4) },
      ],
      profiles: [
        { id: DEMO_USER_ID, name: 'Usuario Demo', role: 'miembro', status: 'active', telefono: '+34 600 000 001', pais: 'España', ciudad: 'Madrid', created_at: hace(90) },
      ],
      children: [],
      servicios_config: [],
      app_config: [],
    };
  }

  // ─── Base de datos en memoria (persistida en este navegador) ──
  let db;
  function loadDb() {
    try {
      const saved = JSON.parse(localStorage.getItem(DB_KEY) || 'null');
      if (saved && saved.v === SEED_VERSION && saved.day === dia(0) && saved.tables) return saved.tables;
    } catch (_) { /* ignorar */ }
    return seed();
  }
  function saveDb() {
    try { localStorage.setItem(DB_KEY, JSON.stringify({ v: SEED_VERSION, day: dia(0), tables: db })); } catch (_) { /* ignorar */ }
  }
  const table = (name) => (db[name] ||= []);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ─── Filtros estilo PostgREST ──
  function parseValue(v) {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }
  const loose = (a, b) => a === b || (a != null && b != null && String(a) === String(b));
  function test(row, col, op, val) {
    const v = row[col];
    switch (op) {
      case 'eq': return loose(v, val);
      case 'neq': return !loose(v, val);
      case 'gt': return v != null && v > val;
      case 'gte': return v != null && v >= val;
      case 'lt': return v != null && v < val;
      case 'lte': return v != null && v <= val;
      case 'is': return val === null ? v == null : v === val;
      case 'in': return (Array.isArray(val) ? val : String(val).replace(/^\(|\)$/g, '').split(',')).some((x) => loose(v, x));
      case 'like': case 'ilike': {
        const rx = new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : '');
        return rx.test(String(v ?? ''));
      }
      case 'cs': case 'contains': {
        const want = Array.isArray(val) ? val : [val];
        return Array.isArray(v) && want.every((x) => v.includes(x));
      }
      default: return true;
    }
  }

  class Query {
    constructor(name) {
      this.name = name;
      this.op = 'select';
      this.filters = [];
      this.orders = [];
      this.lim = null;
      this.rng = null;
      this.one = null;     // 'single' | 'maybe'
      this.returning = false;
      this.countMode = null;
      this.headOnly = false;
    }
    select(_cols, opts = {}) {
      if (this.op === 'select') { this.countMode = opts.count || null; this.headOnly = !!opts.head; }
      else this.returning = true;
      return this;
    }
    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.conflict = (opts.onConflict || 'id').split(','); return this; }
    update(values) { this.op = 'update'; this.payload = values; return this; }
    delete() { this.op = 'delete'; return this; }

    _f(fn) { this.filters.push(fn); return this; }
    eq(c, v) { return this._f((r) => test(r, c, 'eq', v)); }
    neq(c, v) { return this._f((r) => test(r, c, 'neq', v)); }
    gt(c, v) { return this._f((r) => test(r, c, 'gt', v)); }
    gte(c, v) { return this._f((r) => test(r, c, 'gte', v)); }
    lt(c, v) { return this._f((r) => test(r, c, 'lt', v)); }
    lte(c, v) { return this._f((r) => test(r, c, 'lte', v)); }
    is(c, v) { return this._f((r) => test(r, c, 'is', v)); }
    in(c, v) { return this._f((r) => test(r, c, 'in', v)); }
    like(c, v) { return this._f((r) => test(r, c, 'like', v)); }
    ilike(c, v) { return this._f((r) => test(r, c, 'ilike', v)); }
    contains(c, v) { return this._f((r) => test(r, c, 'cs', v)); }
    match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
    filter(c, op, v) { return this._f((r) => test(r, c, op, parseValue(v))); }
    not(c, op, v) { return this._f((r) => !test(r, c, op, parseValue(v))); }
    or(expr) {
      // Solo la forma simple "col.op.valor,col.op.valor"; lo demás no filtra.
      const parts = String(expr).split(',').map((p) => p.match(/^([\w]+)\.(\w+)\.(.*)$/));
      if (parts.some((p) => !p)) return this;
      return this._f((r) => parts.some(([, c, op, v]) => test(r, c, op, parseValue(v))));
    }
    order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    abortSignal() { return this; }
    returns() { return this; }
    throwOnError() { return this; }

    _rows() { return table(this.name).filter((r) => this.filters.every((f) => f(r))); }

    _run() {
      const rows = table(this.name);
      let out;
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => clone(r));
        out = list.map((r) => {
          if (this.op === 'upsert') {
            const hit = rows.find((x) => this.conflict.every((k) => loose(x[k], r[k])));
            if (hit) return Object.assign(hit, r);
          }
          const row = { id: newId(), created_at: new Date().toISOString(), ...r };
          rows.push(row);
          return row;
        });
        saveDb();
      } else if (this.op === 'update') {
        out = this._rows();
        out.forEach((r) => Object.assign(r, clone(this.payload)));
        saveDb();
      } else if (this.op === 'delete') {
        out = this._rows();
        db[this.name] = rows.filter((r) => !out.includes(r));
        saveDb();
      } else {
        out = this._rows();
        for (const { col, asc } of [...this.orders].reverse()) {
          out = [...out].sort((a, b) => {
            const x = a[col], y = b[col];
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
          });
        }
        if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
        if (this.lim != null) out = out.slice(0, this.lim);
      }

      const count = out.length;
      if (this.op !== 'select' && !this.returning && !this.one) return { data: null, error: null, count: null };
      if (this.headOnly) return { data: null, error: null, count };
      if (this.one) {
        if (out.length === 1) return { data: clone(out[0]), error: null, count };
        if (this.one === 'maybe' && out.length === 0) return { data: null, error: null, count };
        return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count };
      }
      return { data: clone(out), error: null, count: this.countMode ? count : null };
    }

    then(resolve, reject) {
      return new Promise((res) => setTimeout(() => res(this._run()), 60)).then(resolve, reject);
    }
    catch(reject) { return this.then(undefined, reject); }
    finally(fn) { return this.then((v) => { fn(); return v; }, (e) => { fn(); throw e; }); }
  }

  // ─── Cliente falso ──
  function demoSession() {
    try {
      const u = JSON.parse(localStorage.getItem('kehila_user') || 'null');
      if (u && u.source === 'demo') {
        return { access_token: 'demo', token_type: 'bearer', user: { id: u.userId, email: u.email, user_metadata: { name: u.name } } };
      }
    } catch (_) { /* ignorar */ }
    return null;
  }
  const ok = (data = null) => Promise.resolve({ data, error: null });
  // Rutas relativas (img/demo/…) → URL absoluta: algunas páginas solo pintan imágenes http(s)
  const absUrl = (p) => (/^(data:|blob:|https?:)/.test(p) ? p : new URL(p, location.href).href);
  const fail = (data = null) => Promise.resolve({ data, error: NO_DISPONIBLE });

  function createDemoSupabase() {
    db = loadDb();
    return {
      from: (name) => new Query(name),
      rpc: () => ok(null),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => ok(),
      functions: { invoke: () => fail() },
      storage: {
        from: () => ({
          getPublicUrl: (p) => ({ data: { publicUrl: absUrl(p) } }),
          createSignedUrl: (p) => ok({ signedUrl: absUrl(p), path: p }),
          createSignedUrls: (paths) => ok(paths.map((p) => ({ path: p, signedUrl: absUrl(p), error: null }))),
          upload: () => fail(),
          remove: () => ok([]),
          download: () => fail(),
        }),
      },
      auth: {
        getSession: () => ok({ session: demoSession() }),
        getUser: () => { const s = demoSession(); return ok({ user: s ? s.user : null }); },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: () => ok(),
        signInWithPassword: () => fail({ user: null, session: null }),
        signUp: () => fail({ user: null, session: null }),
        resetPasswordForEmail: () => fail(),
        updateUser: () => fail(),
        verifyOtp: () => fail(),
        refreshSession: () => ok({ session: demoSession() }),
        mfa: {
          getAuthenticatorAssuranceLevel: () => ok({ currentLevel: 'aal1', nextLevel: 'aal1' }),
          listFactors: () => ok({ all: [], totp: [] }),
          enroll: () => fail(), challenge: () => fail(), verify: () => fail(), unenroll: () => fail(),
        },
      },
    };
  }

  window.createDemoSupabase = createDemoSupabase;
})();
