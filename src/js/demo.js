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
 *    fechas de ejemplo sigan siendo futuras, y al cambiar de idioma (ES/EN).
 *  - En inglés, los textos de ejemplo se sirven traducidos (mapa EN).
 *  - Subidas de archivos, pagos y funciones edge: devuelven un error amable.
 *
 * Todo es ficticio: nombres inventados, dominios example.com, teléfonos +34 600 000 0xx.
 */
(function () {
  'use strict';

  const DB_KEY = 'kehila_demo_db';
  const SEED_VERSION = 13;   // subir al cambiar seed(): descarta lo guardado en los navegadores
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
    balon: '<circle r="40" fill="#fff"/><path d="M0-14 13-4 8 12H-8l-5-16z" fill="#1B2E5E"/><path d="M0-14V-40M13-4 37-12M8 12l15 22M-8 12l-15 22M-13-4-37-12" stroke="#1B2E5E" stroke-width="4"/><circle r="40" fill="none" stroke="#C9A84C" stroke-width="5"/>',
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
        imagen_url: 'img/demo/evento-taller-jalot.jpg',
        descripcion: 'Aprende a trenzar jalot con tus hijos. Incluye ingredientes, delantal y una jalá para llevar a casa.', aforo: 24 }),
      ev('ev-4', 'Torneo de fútbol comunitario', proximo(0, 20), '10:00', 'Parque Deportivo', 'Comunidad', 'balon', 3, {
        imagen_url: 'img/demo/evento-torneo-futbol.jpg',
        descripcion: 'Torneo de fútbol 7 por equipos mixtos de todas las edades. Inscríbete solo o con tu equipo; trofeos y comida kosher.', aforo: 56 }),
      ev('ev-5', 'Encuentro de jóvenes profesionales', proximo(3, 1), '19:30', 'Terraza del centro', 'Comunidad', 'personas', 0, {
        imagen_url: 'img/demo/evento-jovenes-profesionales.jpg',
        descripcion: 'Networking informal para jóvenes de 22 a 35 años, con picoteo kosher y una charla breve.', aforo: 50 }),
      ev('ev-6', 'Celebración de Tu Bishvat', proximo(0, 16), '11:00', 'Jardín del centro', 'Festividad', 'hoja', 1, {
        imagen_url: 'img/demo/evento-tu-bishvat.jpg',
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
        direccion: 'Calle de Ejemplo, 12', telefono: '+34 600 000 011', email: 'hola@panaderia.example.com', kosher: true, cierra_shabat: true, logo_url: 'img/demo/logo-b-1.jpg' }),
      negocio('b-2', 'Restaurante Jerusalén', 'Hostelería', 'Cocina mediterránea e israelí bajo supervisión. Menú del día, comida para llevar y catering para eventos.', {
        direccion: 'Avenida de Muestra, 45', telefono: '+34 600 000 012', web: 'https://restaurante.example.com', kosher: true, cierra_shabat: true, logo_url: 'img/demo/logo-b-2.jpg' }),
      negocio('b-3', 'Asesoría Levi & Asociados', 'Legal', 'Derecho de familia, sucesiones y extranjería. Primera consulta gratuita para miembros de la comunidad.', {
        direccion: 'Plaza Ficticia, 3', telefono: '+34 600 000 013', email: 'contacto@asesoria.example.com', logo_url: 'img/demo/logo-b-3.jpg' }),
      negocio('b-4', 'Clínica Dental Sonrisa', 'Médico', 'Odontología general, ortodoncia e implantes. Descuento del 10 % para familias de la comunidad.', {
        direccion: 'Calle Inventada, 8', telefono: '+34 600 000 014', logo_url: 'img/demo/logo-b-4.jpg' }),
      negocio('b-5', 'Hogar Inmobiliaria', 'Inmobiliaria', 'Compra, venta y alquiler cerca de la sinagoga. Te ayudamos a encontrar casa a distancia caminando.', {
        telefono: '+34 600 000 015', web: 'https://hogar.example.com', logo_url: 'img/demo/logo-b-5.jpg' }),
      negocio('b-6', 'Código Kodesh', 'Tecnología', 'Desarrollo web y apps para pequeños negocios y entidades. Webs, tiendas online y mantenimiento.', {
        email: 'hola@codigo.example.com', web: 'https://codigo.example.com', logo_url: 'img/demo/logo-b-6.jpg' }),
      negocio('b-7', 'Academia Alef', 'Educación', 'Clases particulares de hebreo, matemáticas e inglés para todas las edades. Online o presencial.', {
        telefono: '+34 600 000 017', logo_url: 'img/demo/logo-b-7.jpg' }),
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
      // Carrusel «Momentos inolvidables» del inicio: se ven de 3 en 3; en medio de cada vista, la foto
      // que más contrasta con las de los lados (fútbol en la primera, Bar Mitzvá en la segunda)
      banner_slides: [1, 4, 3, 5, 2, 6].map((n, i) => ({
        id: 'bs-' + n, tipo: 'fotos_comunidad', activo: true, orden: i + 1, imagen_url: `img/demo/momento-${n}.jpg`,
      })),
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
      servicios_config: ['barmitzvah', 'britmila', 'bodas', 'najalah', 'tenyad']
        .map((id) => ({ id, image_url: `img/demo/servicio-${id}.jpg` })),
      // Cabecera del mikve (mikve.html)
      app_config: [1, 2, 3].map((n) => ({ key: `mikve_galeria_${n}`, value: `img/demo/mikve-${n}.jpg` })),
    };
  }

  // ─── Datos del panel de administración (admin.html) ──
  // Miembros, inscripciones con nombre, donaciones, subgrupos, avisos enviados… Se añaden a
  // los de seed(): las inscripciones y donaciones de ejemplo pasan a ser de miembros reales.
  function seedAdmin(t) {
    const PRACTICA = ['Tradicional', 'Ortodoxa', 'Masortí', 'Tradicional', 'Laica'];
    const COMO = ['Amigos o familia', 'Sinagoga', 'Redes sociales', 'Amigos o familia', 'Un evento', 'Web'];
    // [nombre, días desde el alta, estado, rol, ciudad, año de nacimiento]
    const GENTE = [
      ['David Levy', 420, 'active', 'miembro', 'Madrid', 1981], ['Sara Cohen', 400, 'active', 'miembro', 'Madrid', 1986],
      ['Daniel Benarroch', 380, 'active', 'miembro', 'Madrid', 1975], ['Raquel Toledano', 360, 'active', 'staff', 'Madrid', 1979],
      ['Moisés Serfaty', 330, 'active', 'miembro', 'Madrid', 1962], ['Esther Abecasis', 300, 'active', 'miembro', 'Pozuelo', 1990],
      ['Jonathan Amselem', 270, 'active', 'miembro', 'Madrid', 1994], ['Miriam Bendahan', 240, 'active', 'miembro', 'Madrid', 1988],
      ['Samuel Hassan', 200, 'active', 'miembro', 'Alcobendas', 1970], ['Rebeca Azancot', 180, 'active', 'miembro', 'Madrid', 1997],
      ['Isaac Benchimol', 150, 'active', 'miembro', 'Madrid', 1958], ['Lea Garzón', 120, 'active', 'miembro', 'Las Rozas', 1992],
      ['Aarón Pinto', 95, 'active', 'miembro', 'Madrid', 2001], ['Débora Querub', 70, 'active', 'miembro', 'Madrid', 1984],
      ['Yosef Bensadón', 45, 'active', 'staff', 'Madrid', 1977], ['Ruth Chocrón', 30, 'active', 'miembro', 'Pozuelo', 1999],
      ['Elías Benzaquén', 12, 'active', 'miembro', 'Madrid', 1966], ['Noa Wahnón', 5, 'active', 'miembro', 'Madrid', 2003],
      ['Marcos Ruiz', 260, 'suspended', 'miembro', 'Madrid', 1983],
      ['Ana Martínez', 9, 'pending', 'miembro', 'Madrid', 1991], ['Tamar Levy', 4, 'pending', 'miembro', 'Madrid', 1996],
      ['Benjamín Attias', 2, 'pending', 'miembro', 'Alcobendas', 1987], ['Nathan Cohen', 1, 'pending', 'miembro', 'Madrid', 2000],
    ];
    const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.');
    const miembros = GENTE.map(([name, dias, status, role, ciudad, anio], i) => ({
      id: 'u-' + String(i + 1).padStart(2, '0'), name, email: slug(name) + '@example.com',
      telefono: '+34 600 000 ' + String(100 + i), status, role, ciudad, pais: 'España', cp: '28001',
      initials: name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      fecha_nac: `${anio}-0${(i % 9) + 1}-1${i % 9}`, nacionalidad: 'Española', pais_nac: i % 4 ? 'España' : 'Marruecos',
      practica: PRACTICA[i % PRACTICA.length], como_conocio: COMO[i % COMO.length],
      familiar: i % 3 === 0, familiar_nombre: i % 3 === 0 ? L('Familia ', 'The ') + name.split(' ')[1] + L('', 's') : null,
      doc_tipo: 'DNI', created_at: hace(dias, 9 + (i % 9)),
    }));
    const activos = miembros.filter((m) => m.status === 'active');
    const p = t.profiles.find((x) => x.id === DEMO_USER_ID);
    Object.assign(p, { email: 'demo@example.com', initials: 'UD', practica: 'Tradicional', como_conocio: 'Web' });
    t.profiles = [p, ...miembros];
    t.children = [
      { id: 'ch-1', parent_id: 'u-01', nombre: 'Leo', apellidos: 'Levy', fecha_nac: '2015-03-12', created_at: hace(400) },
      { id: 'ch-2', parent_id: 'u-01', nombre: 'Abigail', apellidos: 'Levy', fecha_nac: '2018-07-02', created_at: hace(400) },
      { id: 'ch-3', parent_id: 'u-03', nombre: 'Rafael', apellidos: 'Benarroch', fecha_nac: '2013-11-20', created_at: hace(370) },
    ];

    // Inscripciones: miembros reales (y algún familiar) para que el panel muestre quién va
    const OCUPACION = { 'ev-1': 34, 'ev-2': 14, 'ev-3': 16, 'ev-4': 28, 'ev-5': 19, 'ev-6': 31, 'ev-7': 11 };
    const insc = t.inscripciones.filter((r) => r.usuario_id === DEMO_USER_ID);
    Object.entries(OCUPACION).forEach(([ev, n], e) => {
      for (let i = 0; i < n; i++) {
        const m = activos[(i + e * 3) % activos.length];
        const nombre = m.name.split(' ')[0];
        const familiar = i >= activos.length ? (i % 2 ? L(`Hijo/a de ${nombre}`, `${nombre}'s child`) : L(`Pareja de ${nombre}`, `${nombre}'s partner`)) : null;
        insc.push({ id: `i-${ev}-${i}`, evento_id: ev, usuario_id: m.id, familiar_nombre: familiar, created_at: hace(1 + (i % 9), 10 + (i % 10)) });
      }
    });
    t.inscripciones = insc;

    const CAMP = ['Fondo general', 'Ayuda social', 'Educación', 'Israel'];
    t.donaciones = [...t.donaciones, ...activos.slice(0, 14).map((m, i) => ({
      id: 'd-x' + i, usuario_id: m.id, usuario_nombre: m.name, campana_nombre: CAMP[i % 4],
      cantidad: [18, 36, 50, 100, 180, 26, 72][i % 7], recurrente: i % 4 === 0,
      dedicatoria: i % 5 === 0 ? 'Leilui nishmat de mi abuelo' : null, created_at: hace(2 + i * 3, 11),
    }))];
    t.campanas = [
      { id: 'cp-1', nombre: 'Fondo general', activo: true },
      { id: 'cp-2', nombre: 'Cenas de Shabat para familias', activo: true },
    ];

    t.subgrupos = [
      { id: 'sg-1', nombre: 'Jóvenes profesionales', tipo: 'edad', icono: '💼', descripcion: 'De 22 a 35 años', genero: null, edad_min: 22, edad_max: 35, auto_asignar: true, parent_id: null, creado_en: hace(200) },
      { id: 'sg-2', nombre: 'Grupo de mujeres', tipo: 'genero', icono: '🌸', descripcion: 'Shiurim y actividades', genero: 'mujer', edad_min: null, edad_max: null, auto_asignar: false, parent_id: null, creado_en: hace(190) },
      { id: 'sg-3', nombre: 'Familias Talmud Torah', tipo: 'manual', icono: '📚', descripcion: 'Padres de alumnos', genero: null, edad_min: null, edad_max: null, auto_asignar: false, parent_id: null, creado_en: hace(180) },
      { id: 'sg-4', nombre: 'Equipo de voluntarios', tipo: 'manual', icono: '🤝', descripcion: 'Ayuda social y eventos', genero: null, edad_min: null, edad_max: null, auto_asignar: false, parent_id: null, creado_en: hace(150) },
    ];
    const enGrupo = { 'sg-1': [6, 9, 12, 15, 16, 17], 'sg-2': [1, 3, 5, 7, 9, 11, 13, 15], 'sg-3': [0, 2, 4, 10], 'sg-4': [1, 3, 6, 8, 11, 14, 16] };
    t.subgrupo_miembros = Object.entries(enGrupo).flatMap(([sg, idx]) => idx.map((i) => ({ id: `sm-${sg}-${i}`, subgrupo_id: sg, user_id: activos[i].id })));
    t.subgrupo_miembros.push({ id: 'sm-demo', subgrupo_id: 'sg-4', user_id: DEMO_USER_ID });
    t.staff_permisos = [
      { user_id: 'u-04', area: 'eventos' }, { user_id: 'u-04', area: 'mikve' }, { user_id: 'u-15', area: 'rav' }, { user_id: 'u-15', area: 'servicios' },
    ];

    // Avisos ya enviados (historial de la pestaña Notificaciones)
    t.push_log = [
      { id: 'pl-1', title: 'Shabat Shalom 🕯️', body: 'Encendido de velas hoy a las 18:00. ¡Shabat Shalom a toda la comunidad!', tipo: 'comunidad', total_tokens: 21, sent: 20, failed: 1, created_at: hace(6, 17) },
      { id: 'pl-2', title: 'Nuevo evento: Cena de Shabat comunitaria', body: 'Abiertas las inscripciones. Plazas limitadas.', tipo: 'eventos', total_tokens: 21, sent: 21, failed: 0, created_at: hace(1, 12) },
      { id: 'pl-3', title: 'Recordatorio: shiur del martes', body: 'Esta tarde a las 19:30 en la sala de estudio.', tipo: 'shiurim', total_tokens: 14, sent: 14, failed: 0, created_at: hace(9, 13) },
    ];
    t.notif_envios = [
      { clave: 'evento_nuevo:ev-1', tipo: 'evento_nuevo', total: 21, sent: 20, failed: 1, buzon: 22, created_at: hace(1, 12) },
      { clave: 'cuenta_aprobada:u-18', tipo: 'cuenta_aprobada', total: 1, sent: 1, failed: 0, buzon: 1, created_at: hace(5, 10) },
      { clave: 'rav_respondio:q-1', tipo: 'rav_respondio', total: 1, sent: 1, failed: 0, buzon: 1, created_at: hace(8, 16) },
      { clave: 'noticia_nueva:n-2', tipo: 'noticia_nueva', total: 21, sent: 19, failed: 2, buzon: 22, created_at: hace(4, 11) },
    ];
    t.notif_config = [];

    t.servicios_solicitudes = [
      { id: 'ss-1', tipo: 'bodas', usuario_id: 'u-07', usuario_nombre: 'Jonathan Amselem', created_at: hace(3, 18),
        datos: { 'Nombre del novio': 'Jonathan Amselem', 'Nombre de la novia': 'Rebeca Azancot', 'Teléfono de contacto': '+34 600 000 106', 'Fecha prevista de la boda': dia(150), 'Número de invitados': '180', '¿Habéis recibido clases de pureza familiar?': 'No, nos gustaría recibirlas' } },
      { id: 'ss-2', tipo: 'barmitzvah', usuario_id: 'u-01', usuario_nombre: 'David Levy', created_at: hace(6, 10),
        datos: { 'Nombre del padre / madre': 'David Levy', 'Nombre': 'Leo', 'Bar o Bat Mitzvah': 'Bar Mitzvah (niño)', 'Tipo': 'Preparación + ceremonia en sinagoga', 'Número aproximado de invitados': '90' } },
      { id: 'ss-3', tipo: 'najalah', usuario_id: 'u-05', usuario_nombre: 'Moisés Serfaty', created_at: hace(10, 9),
        datos: { 'Tu nombre completo': 'Moisés Serfaty', 'Nombre completo del fallecido/a': 'Jacob Serfaty', 'Fecha de fallecimiento': '2009-02-14', 'Relación': 'Padre' } },
    ];

    // Agenda del mikve y preguntas/citas de otros miembros
    const MK = [['mujer', '20:00'], ['mujer', '20:30'], ['hombre', '07:00'], ['kelim', '11:00'], ['mujer', '21:00'], ['hombre', '06:45']];
    t.mikve_reservas = [...t.mikve_reservas, ...MK.map(([servicio, hora], i) => ({
      id: 'mk-x' + i, usuario_id: activos[(i * 3 + 1) % activos.length].id, usuario_nombre: activos[(i * 3 + 1) % activos.length].name,
      fecha: dia(i < 4 ? i : -i), hora, servicio, estado: i === 4 ? 'cancelada' : 'confirmada', notas: i === 3 ? 'Vajilla nueva de cristal' : '', total: 0, created_at: hace(i + 1),
    }))];
    t.preguntas_rav = [...t.preguntas_rav,
      { id: 'q-3', usuario_id: 'u-10', usuario_nombre: null, categoria: 'Familia', estado: 'pendiente', publica: false, pregunta: '¿A partir de qué edad deben los niños ayunar en Yom Kipur?', respuesta: null, created_at: hace(0, 8) },
      { id: 'q-4', usuario_id: 'u-13', usuario_nombre: null, categoria: 'Tefila', estado: 'pendiente', publica: true, pregunta: 'Si llego tarde a la sinagoga, ¿qué partes de Shajarit puedo saltarme para rezar la Amidá con el minián?', respuesta: null, created_at: hace(1, 20) },
      { id: 'q-5', usuario_id: 'u-06', usuario_nombre: null, categoria: 'Kashrut', estado: 'pendiente', publica: false, pregunta: '¿Cuánto tiempo hay que esperar entre carne y leche según la costumbre sefardí?', respuesta: null, created_at: hace(2, 15) },
    ];
    t.citas = [...t.citas,
      { id: 'ci-2', usuario_id: 'u-08', tipo_cita: 'Preparación de boda', tipo_emoji: '💍', modalidad: 'presencial', estado: 'pendiente', created_at: hace(1) },
      { id: 'ci-3', usuario_id: 'u-12', tipo_cita: 'Consulta halájica', tipo_emoji: '📖', modalidad: 'online', estado: 'confirmada', created_at: hace(4) },
    ];
    return t;
  }

  // ─── Analíticas (rpc analytics_dashboard): cifras de ejemplo coherentes con los datos ──
  function analyticsDashboard(params) {
    const desde = new Date(params?.p_desde || Date.now() - 30 * 864e5), hasta = new Date(params?.p_hasta || Date.now());
    const prof = table('profiles'), activos = prof.filter((m) => m.status === 'active');
    const pendientes = prof.filter((m) => m.status === 'pending');
    const diasPend = pendientes.map((m) => (Date.now() - new Date(m.created_at)) / 864e5);
    const semanas = [], cohortes = [];
    for (let w = 11; w >= 0; w--) {
      const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1 - w * 7);
      const sem = ymd(d), base = 14 + Math.round(6 * Math.sin(w / 2)) + (11 - w);
      semanas.push({ semana: sem, nuevos: 1 + ((w * 7) % 4), aprobados: 1 + ((w * 5) % 3), activos: base, visitas: base * 9 + w * 3 });
      if (w % 2 === 0) cohortes.push({ semana: sem, tamano: 2 + (w % 3), s1: w >= 1 ? 1 + (w % 2) : null, s2: w >= 2 ? 1 : null, s4: w >= 4 ? 1 : null, s8: w >= 8 ? 1 : null });
    }
    const insc = table('inscripciones');
    const eventos = table('eventos').map((e) => ({ titulo: e.titulo, fecha: e.fecha, aforo: e.aforo, inscritos: insc.filter((i) => i.evento_id === e.id).length }));
    const heatmap = [];
    for (let dow = 1; dow <= 7; dow++) for (let h = 7; h <= 23; h++) {
      const pico = (h >= 19 && h <= 22 ? 6 : h >= 8 && h <= 9 ? 4 : 1) * (dow === 5 ? 1.6 : dow === 6 ? 0.2 : 1);
      heatmap.push([dow, h, Math.round(pico * (1 + ((dow * h) % 3)))]);
    }
    const ev = (event, veces, usuarios, paso) => ({ event, paso: paso ?? null, veces, usuarios, sesiones: usuarios });
    return {
      periodo: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      kpis: {
        nuevos: 7, nuevos_prev: 5, activos: activos.length - 2, activos_prev: activos.length - 5, activos_7d: activos.length - 6,
        miembros_activos: activos.length + 1, pendientes: pendientes.length,
        pendientes_mas_7d: diasPend.filter((d) => d > 7).length,
        pendientes_dias_media: pendientes.length ? Math.round(diasPend.reduce((a, b) => a + b, 0) / pendientes.length * 10) / 10 : 0,
        aprobacion_horas_media: 19, nunca_abrieron: 2,
      },
      semanal: semanas,
      secciones: [['home', 19, 412], ['eventos', 17, 236], ['calendario', 14, 158], ['shiurim', 11, 97], ['rav', 9, 64], ['donativos', 8, 41],
        ['business', 8, 52], ['mikve', 6, 38], ['noticias', 12, 88], ['siddur', 10, 120], ['servicios', 5, 17], ['perfil', 15, 40], ['galeria', 7, 33]]
        .map(([page, usuarios, visitas]) => ({ page, usuarios, visitas })),
      acciones: {
        inscripciones_eventos: insc.length, inscritos_unicos: new Set(insc.map((i) => i.usuario_id)).size,
        mikve_reservas: table('mikve_reservas').length, citas_rav: table('citas').length, preguntas_rav: table('preguntas_rav').length,
        donaciones: table('donaciones').length, donaciones_eur: table('donaciones').reduce((s, d) => s + (d.cantidad || 0), 0),
        noticias_leidas: 143, shiurim_vistas_total: table('shiurim').reduce((s, x) => s + (x.vistas || 0), 0), voluntariado: 6,
        servicios_solicitudes: table('servicios_solicitudes').length,
      },
      cohortes,
      audiencia: {
        edades: [['18–29', 5, 4], ['30–44', 9, 8], ['45–59', 6, 4], ['60+', 3, 2]].map(([franja, miembros, act]) => ({ franja, miembros, activos: act })),
        genero: { hombre: 11, mujer: 12 },
        ciudad: [['Madrid', 17], ['Pozuelo', 2], ['Alcobendas', 2], ['Las Rozas', 1]],
        como_conocio: prof.reduce((acc, m) => { const k = m.como_conocio || 'Sin dato'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
      },
      plataformas: { actividad: { ios: 11, android: 6, pwa: 3, web: 7 }, push: { ios: 10, android: 5 } },
      heatmap,
      eventos,
      app_events: [
        ev('registro_paso', 31, 31, 1), ev('registro_paso', 24, 24, 2), ev('registro_paso', 19, 19, 3), ev('registro_paso', 16, 16, 4), ev('registro_enviado', 14, 14),
        ev('mikve_paso', 12, 12, 1), ev('mikve_paso', 11, 11, 2), ev('mikve_paso', 10, 10, 3), ev('mikve_paso', 9, 9, 4), ev('mikve_paso', 8, 8, 5), ev('mikve_paso', 8, 8, 6), ev('mikve_ok', 7, 7),
        ev('inscripcion_inicio', 64, 41), ev('inscripcion_ok', 52, 34), ev('cita_inicio', 9, 8), ev('cita_ok', 6, 6),
        ev('donacion_inicio', 38, 29), ev('donacion_click', 17, 15), ev('shiur_play', 96, 31),
        ev('login_error', 7, 5), ev('inscripcion_error', 1, 1),
      ],
      calidad: {
        errores_total: 3, errores_usuarios: 2, push_enviados: 96, push_envios: 5, push_fallidos: 3,
        errores_top: [{ msg: 'Failed to fetch', page: 'eventos', veces: 2, ultima: hace(3) }, { msg: 'Load failed', page: 'galeria', veces: 1, ultima: hace(8) }],
        versiones: { 'ios 2.4.0': 9, 'ios 2.3.1': 2, 'android 2.4.0': 5, 'android 2.2.0': 1 },
      },
    };
  }

  // ─── Inglés (botón ES/EN): los datos de ejemplo se sirven ya traducidos ──
  // Solo textos de contenido. Los códigos que la app compara (categoría de evento,
  // de negocio o de pregunta, estado…) se quedan en español: los traduce lang-en-dict.js al pintarlos.
  const LANG = (() => { try { return localStorage.getItem('kehila_lang') === 'en' ? 'en' : 'es'; } catch (_) { return 'es'; } })();
  const DEMO_NAME = LANG === 'en' ? 'Demo User' : 'Usuario Demo';
  const EN = {
    // Eventos
    'Cena de Shabat comunitaria': 'Community Shabbat dinner',
    'Una cena de Shabat para toda la comunidad: kidush, jalot caseras, menú de tres platos y canciones. Ideal para conocer a nuevas familias.': 'A Shabbat dinner for the whole community: kiddush, homemade challah, a three-course menu and songs. A great way to meet new families.',
    'Shiur semanal de Parashá': 'Weekly Parasha shiur',
    'Estudio de la porción semanal con preguntas abiertas y debate. No hace falta conocimiento previo.': 'Study of the weekly Torah portion with open questions and discussion. No prior knowledge needed.',
    'Taller de jalot para familias': 'Challah workshop for families',
    'Aprende a trenzar jalot con tus hijos. Incluye ingredientes, delantal y una jalá para llevar a casa.': 'Learn to braid challah with your kids. Ingredients, an apron and a challah to take home are included.',
    'Torneo de fútbol comunitario': 'Community football tournament',
    'Torneo de fútbol 7 por equipos mixtos de todas las edades. Inscríbete solo o con tu equipo; trofeos y comida kosher.': '7-a-side football tournament with mixed teams of all ages. Sign up on your own or with your team; trophies and a kosher lunch.',
    'Encuentro de jóvenes profesionales': 'Young professionals meetup',
    'Networking informal para jóvenes de 22 a 35 años, con picoteo kosher y una charla breve.': 'Informal networking for 22 to 35-year-olds, with kosher snacks and a short talk.',
    'Celebración de Tu Bishvat': 'Tu BiShvat celebration',
    'Séder de frutos con las siete especies, actividades para niños y plantación simbólica.': 'A fruit seder with the seven species, activities for kids and a symbolic tree planting.',
    'Clase de hebreo para principiantes': 'Hebrew class for beginners',
    'Primer módulo de hebreo conversacional: alefato, saludos y frases útiles del día a día.': 'First module of conversational Hebrew: the alef-bet, greetings and useful everyday phrases.',
    '¡Te esperamos! Recibirás un recordatorio el día antes.': "We'll see you there! You'll get a reminder the day before.",
    'Salón principal': 'Main hall', 'Sala de estudio': 'Study room', 'Cocina comunitaria': 'Community kitchen',
    'Parque Deportivo': 'Sports park', 'Terraza del centro': 'Center terrace', 'Jardín del centro': 'Center garden', 'Aula 2': 'Classroom 2',
    // Noticias
    'Abrimos inscripciones para la cena de Shabat comunitaria': 'Sign-ups are open for the community Shabbat dinner',
    'Más de 80 plazas, menú de tres platos y un ambiente familiar. Reserva tu sitio desde la sección de eventos.': 'Over 80 seats, a three-course menu and a family atmosphere. Book your place from the events section.',
    'Este viernes celebramos una nueva cena de Shabat comunitaria en el salón principal.\n\nHabrá kidush, jalot caseras, un menú de tres platos preparado bajo supervisión y un rato de canciones al final. Es una ocasión ideal para conocer a las familias que se han unido en los últimos meses.\n\nLas plazas son limitadas: inscríbete desde la sección de eventos de la app.': "This Friday we're holding another community Shabbat dinner in the main hall.\n\nThere will be kiddush, homemade challah, a supervised three-course menu and some singing at the end. It's the perfect chance to meet the families who have joined in recent months.\n\nSeats are limited: sign up from the events section of the app.",
    'Nuevo horario de tefilot durante el invierno': 'New winter prayer times',
    'Con el cambio de hora ajustamos Minjá y Arvit. Consulta los nuevos horarios en la página de inicio.': "With the clock change we've adjusted Mincha and Maariv. Check the new times on the home page.",
    'A partir de esta semana, Minjá y Arvit se adelantan para adaptarse a la puesta de sol de invierno.\n\nLos horarios actualizados están siempre en la página de inicio de la app, en el apartado de horarios de la sinagoga.': 'From this week, Mincha and Maariv move earlier to follow the winter sunset.\n\nThe updated times are always on the app home page, under the synagogue times.',
    '¿Cómo kasherizar la cocina después de una mudanza?': 'How to kasher your kitchen after a move',
    'Una guía práctica, paso a paso, para preparar una cocina nueva según la halajá.': 'A practical, step-by-step guide to setting up a new kitchen according to halacha.',
    'Mudarse a una casa nueva es un buen momento para revisar la kashrut de la cocina.\n\nEn este artículo repasamos qué utensilios se pueden kasherizar, cuáles conviene sustituir y cómo organizar los espacios de carne y leche.\n\nSi tienes dudas concretas, puedes preguntar al rabino desde la sección «Pregunta al Rav».': 'Moving into a new home is a good time to review the kashrut of your kitchen.\n\nIn this article we go over which utensils can be kashered, which are better replaced, and how to organize meat and dairy areas.\n\nIf you have specific questions, you can ask the rabbi from the "Ask the Rav" section.',
    'Las leyes de Shabat en la vida moderna': 'Shabbat laws in modern life',
    'Ascensores, luces automáticas y teléfonos: respuestas a las preguntas más frecuentes.': 'Elevators, automatic lights and phones: answers to the most common questions.',
    'Cada semana recibimos preguntas sobre cómo aplicar las leyes de Shabat a la tecnología actual.\n\nHemos recopilado las más frecuentes con respuestas claras y fuentes para quien quiera profundizar.': 'Every week we get questions about applying the laws of Shabbat to today\'s technology.\n\nWe\'ve collected the most common ones, with clear answers and sources for anyone who wants to go deeper.',
    'Gran éxito del festival de Janucá': 'A great Chanukah festival',
    'Más de 300 personas encendieron con nosotros la última vela. ¡Gracias a todos los voluntarios!': 'More than 300 people lit the last candle with us. Thank you to all the volunteers!',
    'El festival de Janucá reunió a más de 300 personas en la plaza del centro.\n\nHubo sufganiot, música en directo y talleres para los más pequeños. Gracias a todos los voluntarios que lo hicieron posible.': 'The Chanukah festival brought more than 300 people together in the center plaza.\n\nThere were sufganiyot, live music and workshops for the little ones. Thank you to all the volunteers who made it happen.',
    'Misión solidaria a Israel: abiertas las plazas': 'Volunteer mission to Israel: places now open',
    'Una semana de voluntariado y visitas. Plazas limitadas para mayores de 18 años.': 'A week of volunteering and visits. Limited places, ages 18 and over.',
    'Organizamos una misión solidaria de una semana a Israel con actividades de voluntariado, visitas y encuentros.\n\nLas plazas son limitadas; escríbenos desde la sección de contacto para recibir el programa completo.': "We're organizing a one-week volunteer mission to Israel with volunteering, visits and meetings.\n\nPlaces are limited; write to us from the contact section to get the full program.",
    'Secretaría': 'Office', 'Rabinato': 'Rabbinate', 'Equipo de eventos': 'Events team',
    // Negocios
    'Panadería Shalom': 'Shalom Bakery', 'Restaurante Jerusalén': 'Jerusalem Restaurant', 'Asesoría Levi & Asociados': 'Levi & Associates Law',
    'Clínica Dental Sonrisa': 'Sonrisa Dental Clinic', 'Hogar Inmobiliaria': 'Hogar Real Estate', 'Academia Alef': 'Alef Academy',
    'Miembro de la comunidad': 'Community member',
    'Jalot, rugelaj y bollería kosher parve horneada cada mañana. Encargos para Shabat hasta el jueves.': 'Challah, rugelach and pareve kosher pastries baked every morning. Shabbat orders until Thursday.',
    'Cocina mediterránea e israelí bajo supervisión. Menú del día, comida para llevar y catering para eventos.': 'Supervised Mediterranean and Israeli cuisine. Daily set menu, takeaway and event catering.',
    'Derecho de familia, sucesiones y extranjería. Primera consulta gratuita para miembros de la comunidad.': 'Family law, inheritance and immigration. First consultation free for community members.',
    'Odontología general, ortodoncia e implantes. Descuento del 10 % para familias de la comunidad.': 'General dentistry, orthodontics and implants. 10% discount for community families.',
    'Compra, venta y alquiler cerca de la sinagoga. Te ayudamos a encontrar casa a distancia caminando.': 'Buying, selling and renting near the synagogue. We help you find a home within walking distance.',
    'Desarrollo web y apps para pequeños negocios y entidades. Webs, tiendas online y mantenimiento.': 'Web and app development for small businesses and organizations. Websites, online stores and maintenance.',
    'Clases particulares de hebreo, matemáticas e inglés para todas las edades. Online o presencial.': 'Private lessons in Hebrew, math and English for all ages. Online or in person.',
    // Shiurim
    'La parashá de la semana en 15 minutos': 'The weekly parasha in 15 minutes',
    'Introducción a las bendiciones de los alimentos': 'Introduction to the blessings over food',
    'Preparar Shabat sin estrés': 'Preparing for Shabbat without stress',
    'Historia de las comunidades sefardíes': 'History of the Sephardic communities',
    'Hoja semanal: ideas para la mesa de Shabat': 'Weekly sheet: ideas for the Shabbat table',
    'Hoja semanal: jaguim y tradiciones': 'Weekly sheet: holidays and traditions',
    'Rabanit Demo': 'Rebbetzin Demo', 'Prof. Invitado': 'Guest lecturer',
    // Galería
    'Shabat': 'Shabbat', 'Eventos': 'Events', 'Janucá': 'Chanukah', 'Estudio': 'Study', 'Voluntariado': 'Volunteering',
    'Cena de Shabat': 'Shabbat dinner', 'Concierto de primavera': 'Spring concert', 'Encendido en la plaza': 'Lighting in the plaza',
    'Encuentro de familias': 'Family gathering', 'Shiur de los martes': 'Tuesday shiur', 'Velas de Shabat': 'Shabbat candles',
    'Tu Bishvat en el jardín': 'Tu BiShvat in the garden', 'Kidush comunitario': 'Community kiddush', 'Reparto solidario': 'Charity delivery',
    // Calendario
    'Reunión de la junta': 'Board meeting', 'Reunión mensual abierta a socios.': 'Monthly meeting, open to members.', 'Sala de juntas': 'Boardroom',
    'Talmud Torah: entrega de notas': 'Talmud Torah: report cards', 'Aulas': 'Classrooms',
    'Bar Mitzvá en la sinagoga': 'Bar Mitzvah at the synagogue', '¡Mazal tov a la familia!': 'Mazal tov to the family!', 'Sinagoga': 'Synagogue',
    // Rav
    '¿Se puede dejar una luz con temporizador encendida durante Shabat?': 'Can I leave a light on a timer during Shabbat?',
    'Sí, siempre que el temporizador se programe antes de que empiece Shabat y no se modifique después. Es una solución muy habitual.': "Yes, as long as the timer is set before Shabbat begins and isn't changed afterwards. It's a very common solution.",
    '¿Qué hechsher es fiable para el chocolate que se vende en supermercados?': 'Which hechsher is reliable for chocolate sold in supermarkets?',
    // Donaciones, citas, horarios, avisos, perfil
    'Fondo general': 'General fund', 'Ayuda social': 'Social aid', 'Consulta personal': 'Personal consultation',
    'Shajarit': 'Shacharit', 'Minjá': 'Mincha', 'Arvit': 'Maariv', 'Kabalat Shabat': 'Kabbalat Shabbat', 'Shajarit de Shabat': 'Shabbat Shacharit', 'Havdalá': 'Havdalah',
    'Nuevo evento: Cena de Shabat comunitaria': 'New event: Community Shabbat dinner',
    'Ya puedes inscribirte. Plazas limitadas.': 'Sign-ups are open. Limited places.',
    'El rabino ha respondido a tu pregunta': 'The rabbi has answered your question',
    '¿Se puede dejar una luz con temporizador…?': 'Can I leave a light on a timer…?',
    'Nuevo horario de tefilot': 'New prayer times', 'Consulta los horarios de invierno.': 'Check the winter times.',
    'Usuario Demo': 'Demo User', 'España': 'Spain',
    // Panel de administración
    'Tradicional': 'Traditional', 'Ortodoxa': 'Orthodox', 'Masortí': 'Masorti', 'Laica': 'Secular',
    'Amigos o familia': 'Friends or family', 'Redes sociales': 'Social media', 'Un evento': 'An event', 'Española': 'Spanish', 'Marruecos': 'Morocco',
    'Educación': 'Education', 'Israel': 'Israel', 'Leilui nishmat de mi abuelo': 'In memory of my grandfather',
    'Cenas de Shabat para familias': 'Shabbat dinners for families',
    'Jóvenes profesionales': 'Young professionals', 'De 22 a 35 años': 'Ages 22 to 35', 'Grupo de mujeres': "Women's group",
    'Shiurim y actividades': 'Shiurim and activities', 'Familias Talmud Torah': 'Talmud Torah families', 'Padres de alumnos': "Students' parents",
    'Equipo de voluntarios': 'Volunteer team', 'Ayuda social y eventos': 'Social aid and events',
    'Shabat Shalom 🕯️': 'Shabbat Shalom 🕯️', 'Encendido de velas hoy a las 18:00. ¡Shabat Shalom a toda la comunidad!': 'Candle lighting today at 18:00. Shabbat Shalom to the whole community!',
    'Abiertas las inscripciones. Plazas limitadas.': 'Sign-ups are open. Limited places.',
    'Recordatorio: shiur del martes': "Reminder: Tuesday's shiur", 'Esta tarde a las 19:30 en la sala de estudio.': 'This evening at 19:30 in the study room.',
    'No, nos gustaría recibirlas': "No, we'd like to take them", 'Bar Mitzvah (niño)': 'Bar Mitzvah (boy)',
    'Preparación + ceremonia en sinagoga': 'Preparation + synagogue ceremony', 'Padre': 'Father',
    'Vajilla nueva de cristal': 'New glass dishes',
    '¿A partir de qué edad deben los niños ayunar en Yom Kipur?': 'From what age should children fast on Yom Kippur?',
    'Si llego tarde a la sinagoga, ¿qué partes de Shajarit puedo saltarme para rezar la Amidá con el minián?': 'If I arrive late to synagogue, which parts of Shacharit can I skip to say the Amidah with the minyan?',
    '¿Cuánto tiempo hay que esperar entre carne y leche según la costumbre sefardí?': 'How long should you wait between meat and dairy according to Sephardic custom?',
    'Preparación de boda': 'Wedding preparation', 'Consulta halájica': 'Halachic consultation',
  };
  // Campos que son códigos: la app los compara ('Shabat', 'Estudio'…), no se traducen
  const CODIGOS = new Set(['id', 'categoria', 'estado', 'tipo', 'apartado', 'servicio', 'modalidad', 'role', 'status', 'usuario_id', 'user_id', 'evento_id']);
  /** Traduce en profundidad los textos de las tablas (coincidencia exacta). */
  function localize(v) {
    if (LANG !== 'en') return v;
    if (typeof v === 'string') return Object.prototype.hasOwnProperty.call(EN, v) ? EN[v] : v;
    if (Array.isArray(v)) return v.map(localize);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) if (!CODIGOS.has(k)) v[k] = localize(v[k]); }
    return v;
  }

  // El nombre del usuario demo sigue al idioma (se guardó al entrar, quizá en el otro idioma)
  try {
    const u = JSON.parse(localStorage.getItem('kehila_user') || 'null');
    if (u && u.source === 'demo' && u.name !== DEMO_NAME) localStorage.setItem('kehila_user', JSON.stringify({ ...u, name: DEMO_NAME }));
  } catch (_) { /* ignorar */ }

  // ─── Base de datos en memoria (persistida en este navegador) ──
  let db;
  function loadDb() {
    try {
      const saved = JSON.parse(localStorage.getItem(DB_KEY) || 'null');
      if (saved && saved.v === SEED_VERSION && saved.lang === LANG && saved.day === dia(0) && saved.tables) return saved.tables;
    } catch (_) { /* ignorar */ }
    return localize(seedAdmin(seed()));
  }
  function saveDb() {
    try { localStorage.setItem(DB_KEY, JSON.stringify({ v: SEED_VERSION, lang: LANG, day: dia(0), tables: db })); } catch (_) { /* ignorar */ }
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
    syncRole();
    return {
      from: (name) => new Query(name),
      rpc: (name, params) => ok(name === 'analytics_dashboard' ? analyticsDashboard(params) : null),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => ok(),
      functions: { invoke: (name, opts) => ok(demoFunction(name, opts && opts.body)) },
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

  // ─── Rol (miembro / admin) ──
  // El usuario demo es uno solo: el panel comprueba el rol contra profiles (verifyAdminRealtime),
  // así que el perfil sigue al rol con el que se entró o al que se cambió con el botón.
  function currentUser() { try { return JSON.parse(localStorage.getItem('kehila_user') || 'null'); } catch (_) { return null; } }
  function syncRole() {
    const u = currentUser(), p = table('profiles').find((x) => x.id === DEMO_USER_ID);
    if (u && u.source === 'demo' && p && p.role !== u.role) { p.role = u.role; saveDb(); }
  }
  function setRole(role) {
    const u = currentUser();
    if (!u || u.source !== 'demo') return;
    localStorage.setItem('kehila_user', JSON.stringify({ ...u, role }));
    if (db) syncRole();
    location.href = role === 'admin' ? 'admin.html' : 'home.html';
  }

  // ─── Funciones edge simuladas ──
  /** Envía un aviso: lo deja en la campana 🔔 de los destinatarios (incluido el usuario demo) y en el historial. */
  function sendPush(body) {
    body = body || {};
    const prof = table('profiles');
    let ids = body.subgrupo_id
      ? table('subgrupo_miembros').filter((m) => m.subgrupo_id === body.subgrupo_id).map((m) => m.user_id)
      : prof.filter((m) => m.status === 'active').map((m) => m.id);
    if (!body.subgrupo_id && !ids.includes(DEMO_USER_ID)) ids.push(DEMO_USER_ID);
    const now = new Date().toISOString();
    ids.forEach((user_id) => table('notif_buzon').push({
      id: newId(), user_id, tipo: body.tipo || 'comunidad', titulo: body.title || '', cuerpo: body.body || '', url: null, leida: false, created_at: now,
    }));
    const failed = ids.length > 8 ? 1 : 0;
    table('push_log').push({ id: newId(), title: body.title, body: body.body, tipo: body.tipo || 'comunidad', total_tokens: ids.length, sent: ids.length - failed, failed, created_at: now });
    saveDb();
    avisarEnPantalla(body.title, body.body, ids.includes(DEMO_USER_ID));
    return { sent: ids.length - failed, failed, total: ids.length };
  }
  function demoFunction(name, body) {
    switch (name) {
      case 'send-push': return sendPush(body);
      case 'notify-approval': return { email: true, pushSent: 1, pushFailed: 0 };
      case 'notif-instant': case 'notif-cron': {
        // «Probar en mi móvil»: el aviso de prueba llega al propio usuario demo
        const r = sendPushTo([DEMO_USER_ID], { title: L('Aviso de prueba', 'Test notification'), body: L('Así verán los miembros este aviso automático.', 'This is how members will see this automatic notification.') });
        return { ok: true, sent: r, total: r, buzon: r };
      }
      default: return { ok: true };
    }
  }
  function sendPushTo(ids, msg) {
    const now = new Date().toISOString();
    ids.forEach((user_id) => table('notif_buzon').push({ id: newId(), user_id, tipo: 'prueba', titulo: msg.title, cuerpo: msg.body, url: null, leida: false, created_at: now }));
    saveDb();
    avisarEnPantalla(msg.title, msg.body, true);
    return ids.length;
  }
  // Las páginas también llaman a las funciones con fetch(SUPABASE_URL + '/functions/v1/…')
  const FN_URL = '{{integrations.supabaseUrl}}/functions/v1/';
  const SIN_DEMO = ['create-payment-intent', 'create-subscription', 'upload-document', 'view-document', 'delete-account'];
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.startsWith(FN_URL)) return realFetch(input, init);
    if (!db) db = loadDb();
    const name = url.slice(FN_URL.length).split(/[?/]/)[0];
    let body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { /* cuerpo no JSON */ }
    const res = SIN_DEMO.includes(name)
      ? new Response(JSON.stringify({ error: NO_DISPONIBLE.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify(demoFunction(name, body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Promise((r) => setTimeout(() => r(res), 400));
  };

  // ─── Interfaz de la demo ──
  const L = (es, en) => (LANG === 'en' ? en : es);
  const CSS = `
    #demo-role{position:fixed;right:20px;bottom:64px;z-index:9000;display:flex;background:#fff;border-radius:22px;box-shadow:0 4px 14px rgba(0,0,0,.2);padding:3px;font:600 12px/1 system-ui,-apple-system,sans-serif}
    #demo-role button{border:0;background:none;padding:8px 12px;border-radius:19px;cursor:pointer;color:#1B2E5E;font:inherit}
    #demo-role button.on{background:#1B2E5E;color:#fff}
    @media (max-width:1023px){#demo-role{right:14px;bottom:calc(128px + env(safe-area-inset-bottom,0px))}}
    #demo-push{position:fixed;left:50%;top:16px;z-index:10000;width:min(380px,calc(100vw - 32px));transform:translate(-50%,-200%);visibility:hidden;transition:transform .45s cubic-bezier(.2,.9,.3,1.2),visibility 0s .45s;
      background:rgba(250,250,252,.97);backdrop-filter:blur(12px);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:12px 14px;display:flex;gap:10px;font-family:system-ui,-apple-system,sans-serif;color:#111}
    #demo-push.show{transform:translate(-50%,0);visibility:visible;transition:transform .45s cubic-bezier(.2,.9,.3,1.2)}
    #demo-push img{width:38px;height:38px;border-radius:9px;flex-shrink:0}
    #demo-push .t{font-weight:600;font-size:14px;margin:1px 0 2px}#demo-push .b{font-size:13px;color:#333;line-height:1.35}
    #demo-push .k{font-size:11px;color:#777;display:flex;justify-content:space-between;gap:8px}
    #demo-login{margin-top:18px;padding:14px;border:1px dashed #C9A84C;border-radius:12px;background:rgba(201,168,76,.07);font-family:inherit}
    #demo-login p{margin:0 0 10px;font-size:13px;color:#555}
    #demo-login div{display:flex;gap:8px}
    #demo-login button{flex:1;padding:10px;border-radius:10px;border:1.5px solid #1B2E5E;background:#fff;color:#1B2E5E;font-weight:600;cursor:pointer;font-family:inherit}
    #demo-login button.admin{background:#1B2E5E;color:#fff}`;

  /** Simula el aviso que recibe el móvil de un miembro y refresca la campana 🔔. */
  function avisarEnPantalla(title, body, alUsuario) {
    if (alUsuario) setTimeout(() => document.dispatchEvent(new Event('visibilitychange')), 200);
    const el = document.getElementById('demo-push');
    if (!el) return;
    el.querySelector('.t').textContent = title || '';
    el.querySelector('.b').textContent = body || '';
    el.classList.add('show');
    clearTimeout(avisarEnPantalla.t);
    avisarEnPantalla.t = setTimeout(() => el.classList.remove('show'), 6000);
  }

  function montarInterfaz() {
    const page = location.pathname.split('/').pop() || 'index.html';
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    const push = document.createElement('div');
    push.id = 'demo-push'; push.className = 'notranslate';
    push.innerHTML = `<img src="img/icon-192.png" alt=""><div style="flex:1;min-width:0"><div class="k"><span>{{appName}}</span><span>${L('ahora', 'now')}</span></div><div class="t"></div><div class="b"></div></div>`;
    document.body.appendChild(push);

    const u = currentUser();
    if (/^(index\.html|reset-password\.html)$/.test(page)) {
      // Login: entrar con un clic como miembro o como administrador
      const form = document.getElementById('login-form');
      if (!form || document.getElementById('demo-login')) return;
      const box = document.createElement('div');
      box.id = 'demo-login'; box.className = 'notranslate';
      box.innerHTML = `<p>${L('Demo: entra con un clic', 'Demo: sign in with one click')}</p><div>
        <button type="button" data-email="demo@example.com">${L('Como miembro', 'As a member')}</button>
        <button type="button" class="admin" data-email="admin@example.com">${L('Como administrador', 'As an admin')}</button></div>`;
      box.querySelectorAll('button').forEach((b) => b.onclick = () => {
        document.getElementById('login-email').value = b.dataset.email;
        document.getElementById('login-password').value = 'demo';
        form.requestSubmit();
      });
      form.insertAdjacentElement('afterend', box);
      return;
    }
    if (!u || u.source !== 'demo') return;
    // Cambiar de vista sin cerrar sesión
    const sw = document.createElement('div');
    sw.id = 'demo-role'; sw.className = 'notranslate';
    const esAdmin = u.role === 'admin';
    sw.innerHTML = `<button type="button" class="${esAdmin ? '' : 'on'}" data-role="miembro">👤 ${L('Miembro', 'Member')}</button><button type="button" class="${esAdmin ? 'on' : ''}" data-role="admin">🛠 ${L('Admin', 'Admin')}</button>`;
    sw.querySelectorAll('button').forEach((b) => b.onclick = () => { if (b.dataset.role !== u.role) setRole(b.dataset.role); });
    document.body.appendChild(sw);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarInterfaz);
  else montarInterfaz();

  window.createDemoSupabase = createDemoSupabase;
})();
