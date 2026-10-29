/* =============================================
   KEHILÁ — i18n.js
   Sistema de traducción ES / EN
   ============================================= */

const TRANSLATIONS = {
  es: {
    // Navegación
    nav_home:         'Inicio',
    nav_eventos:      'Eventos',
    nav_calendario:   'Calendario Hebreo',
    nav_noticias:     'Noticias',
    nav_shiurim:      'Shiurim',
    nav_rav:          'Preguntas al Rav',
    nav_wallap:       'Wallap',
    nav_kosher:       'Kosher',
    nav_business:     'Jewish Business',
    nav_donativos:    'Donativos',
    nav_galeria:      'Galería',
    nav_professionals:'Professionals',
    nav_voluntariado: 'Voluntariado',
    nav_citas:        'Cita con el Rav',
    nav_contacto:     'Contacto',
    nav_siddur:       'Sidur',
    nav_servicios:    'Servicios',
    nav_perfil:       'Mi perfil',
    nav_admin:        'Administración',
    nav_logout:       'Cerrar sesión',
    nav_more:         'Más',

    // Grupos de nav
    group_principal:  'Principal',
    group_comunidad:  'Comunidad',
    group_esencial:   'Esencial',
    group_servicios:  'Servicios',
    group_tefila:     'Tefila',
    group_cuenta:     'Mi cuenta',
    group_mas:        'Más',

    // Nav extra
    nav_comunidad:    '{{labels.business}}',
    nav_rav_hub:      'Torá y Comunidad',
    nav_esencial:     '{{labels.services}}',
    nav_mikve:        'Mikve',

    // Común
    save:             'Guardar cambios',
    cancel:           'Cancelar',
    back:             'Volver',
    back_home:        'Volver al inicio',
    edit:             'Editar datos',
    loading:          'Cargando...',
    ver_mas:          'Ver más',
    ver_todo:         'Ver todo',
    inscribirse:      'Inscribirse',
    inscrito:         'Inscrito',

    // Home
    home_greeting:       'Shalom',
    home_shabbat:        'Shabbat esta semana',
    home_quick:          'Accesos rápidos',
    home_quick_rav:      'Preg. al Rav',
    home_quick_cal:      'Cal. Hebreo',
    home_banner_manage:  'Gestionar',
    home_eventos:        'Próximos eventos',
    home_noticias:       'Últimas noticias',
    home_sinagoga:       '{{centerName}} — {{contact.street}}',

    // Eventos (dinámico)
    ev_completo:    'Completo',
    ev_pocas:       '¡Solo {n} plazas!',
    ev_plazas:      '{n} plazas libres',

    // Perfil
    perfil_title:     'Mi perfil',
    perfil_label:     'Mi cuenta',
    perfil_personal:  'Datos personales',
    perfil_address:   'Dirección',
    perfil_comunidad: 'Comunidad',
    perfil_doc:       'Documento de identidad',
    perfil_solicitud: 'Solicitud de acceso',
    perfil_nombre:    'Nombre',
    perfil_apellidos: 'Apellidos',
    perfil_telefono:  'Teléfono',
    perfil_fechanac:  'Fecha de nacimiento',
    perfil_nacional:  'Nacionalidad',
    perfil_paisnac:   'País de nacimiento',
    perfil_pais:      'País',
    perfil_ciudad:    'Ciudad',
    perfil_cp:        'Código postal',
    perfil_direccion: 'Dirección',
    perfil_practica:  'Práctica religiosa',
    perfil_familiar:  'Familiar en kehilá',
    perfil_conocio:   'Cómo conoció {{name}}',
    perfil_doc_tipo:  'Tipo',
    perfil_doc_num:   'Número',
    perfil_photo:     'Cambiar foto',
    perfil_saved:     'Perfil actualizado',
    perfil_nodata:    'No indicado',

    // Admin
    admin_title:      'Panel de Control',
    admin_subtitle:   'Gestiona tu comunidad desde aquí',
    admin_resumen:    'Resumen',
    admin_usuarios:   'Usuarios',
    admin_eventos:    'Eventos',
    admin_noticias:   'Noticias',
    admin_market:     'Marketplace',
    admin_rav:        'Preguntas Rav',
    admin_activos:    'Usuarios activos',
    admin_pendientes: 'Pendientes aprobación',
    admin_evmes:      'Eventos este mes',
    admin_donativos:  'Donativos recibidos',
    admin_actividad:  'Actividad reciente',
    admin_aprobar:    'Aprobar',
    admin_rechazar:   'Rechazar',
    admin_suspender:  'Suspender',
    admin_banear:     'Banear',
    admin_reactivar:  'Reactivar',
    admin_ver:        'Ver solicitud',

    // Status/roles
    status_active:    'Activo',
    status_pending:   'Pendiente',
    status_banned:    'Baneado',
    role_admin:       'Admin',
    role_mod:         'Mod.',
    role_miembro:     'Miembro',

    // Login
    login_title:      'Bienvenido de nuevo',
    login_subtitle:   'Accede a tu comunidad',
    login_email:      'Correo electrónico',
    login_password:   'Contraseña',
    login_btn:        'Entrar',
    login_register:   '¿Aún no eres miembro?',
    login_register2:  'Solicitar acceso',

    // Registro
    reg_title:        'Solicitar acceso',
    reg_step1:        'Cuenta',
    reg_step2:        'Identidad',
    reg_step3:        'Residencia',
    reg_step4:        'Revisión',

    // Login — extra
    login_pretitle:    'Acceso',
    login_forgot:       '¿Olvidaste tu contraseña?',
    login_iniciar_sesion: 'Iniciar sesión',

    // Registro — botones compartidos
    reg_btn_continuar: 'Continuar',
    reg_btn_atras:     'Atrás',
    reg_opcional:      '(opcional)',
    reg_selecciona:    'Selecciona',
    reg_otro:          'Otro',

    // Paso 1
    reg_s1_pretitle:   'Paso 1 de 4',
    reg_s1_title:      'Crea tu cuenta',
    reg_s1_subtitle:   'Información básica de acceso',
    reg_nombre:        'Nombre',
    reg_nombre_ph:     'Como en tu DNI/Pasaporte',
    reg_apellidos:     'Apellidos',
    reg_apellidos_ph:  'Apellidos completos',
    reg_email:         'Correo electrónico',
    reg_email_hint:    'Recibirás comunicaciones importantes aquí',
    reg_telefono:      'Teléfono',
    reg_telefono_hint: 'Para verificación y contacto urgente de la comunidad',
    reg_password:      'Contraseña',
    reg_password_ph:   'Mín. 8 caracteres',
    reg_confirm_pw:    'Confirmar contraseña',
    reg_confirm_pw_ph: 'Repite la contraseña',

    // Paso 2
    reg_s2_pretitle:   'Paso 2 de 4',
    reg_s2_title:      'Verificación de identidad',
    reg_s2_subtitle:   'Requerida para proteger la seguridad de la comunidad',
    reg_s2_banner:     'Por la seguridad de todos los miembros, verificamos la identidad de cada persona. Tu información es tratada con total confidencialidad y solo accesible por la dirección de la comunidad.',
    reg_doctipo:       'Tipo de documento',
    reg_doctipo_ph:    'Selecciona el tipo',
    doc_dni:           'DNI español',
    doc_nie:           'NIE (Número de Identidad Extranjero)',
    doc_pasaporte:     'Pasaporte (cualquier país)',
    doc_cedula:        'Cédula de identidad',
    doc_otro:          'Otro documento oficial',
    reg_docnum:        'Número de documento',
    reg_docnum_ph:     'Número del documento',
    reg_fechanac:      'Fecha de nacimiento',
    reg_dia:           'Día',
    reg_mes:           'Mes',
    reg_anio:          'Año',
    mes_1: 'Enero', mes_2: 'Febrero', mes_3: 'Marzo', mes_4: 'Abril',
    mes_5: 'Mayo', mes_6: 'Junio', mes_7: 'Julio', mes_8: 'Agosto',
    mes_9: 'Septiembre', mes_10: 'Octubre', mes_11: 'Noviembre', mes_12: 'Diciembre',
    reg_nacionalidad:  'Nacionalidad',
    reg_paisnac:       'País de nacimiento',
    pais_espana: 'España', pais_israel: 'Israel', pais_argentina: 'Argentina',
    pais_uruguay: 'Uruguay', pais_francia: 'Francia', pais_eeuu: 'Estados Unidos',
    pais_mexico: 'México', pais_venezuela: 'Venezuela', pais_colombia: 'Colombia',
    pais_brasil: 'Brasil', pais_reinounido: 'Reino Unido', pais_marruecos: 'Marruecos',
    pais_otra: 'Otra',
    reg_ck_verdad:     'Confirmo que los datos proporcionados son verídicos. Entiendo que proporcionar información falsa resulta en la denegación permanente del acceso.',

    // Paso 3
    reg_s3_pretitle:   'Paso 3 de 4',
    reg_s3_title:      'Información de residencia',
    reg_s3_subtitle:   'Para asignarte a tu comunidad local',
    reg_paisres:       'País de residencia',
    reg_paisres_ph:    'Selecciona tu país',
    reg_ciudad:        'Ciudad',
    reg_ciudad_ph:     'Tu ciudad',
    reg_cp:            'Código postal',
    reg_cp_ph:         'Ej. 28001',
    reg_cp_hint:       'Para enviarte info de eventos cercanos',
    reg_direccion:     'Dirección',
    reg_direccion_ph:  'Calle y número',
    reg_direccion_hint:'No compartida con otros miembros',
    reg_familiar:      '¿Tienes familiares en la comunidad?',
    reg_familiar_ck:   'Sí, tengo un familiar miembro',
    reg_familiar_ph:   'Nombre del familiar',
    reg_familiar_hint: 'Ayuda a agilizar tu verificación',

    // Paso 4
    reg_s4_pretitle:   'Paso 4 de 4',
    reg_s4_title:      'Revisión final',
    reg_s4_subtitle:   'Confirma tus datos antes de enviar',
    reg_modificar:     'Modificar datos',
    reg_ck1_pre:       'He leído y acepto los',
    reg_ck1_link:      'Términos de Uso y Normas de Convivencia',
    reg_ck1_post:      'de la comunidad {{name}}.',
    reg_ck2_pre:       'Acepto la',
    reg_ck2_link:      'Política de Privacidad',
    reg_ck2_post:      'y el tratamiento de mis datos personales conforme al RGPD.',
    reg_ck3:           'Entiendo que mi solicitud será revisada manualmente por la administración y que el acceso no es automático ni está garantizado.',
    reg_ck4:           'Confirmo que soy judío/a o tengo un vínculo directo con la comunidad judía, y que mi interés es participar de forma positiva en la vida comunitaria.',
    reg_declaration:   'Al enviar esta solicitud, declaro bajo mi responsabilidad que toda la información proporcionada es verídica. Soy consciente de que cualquier falsedad resulta en la denegación permanente del acceso.',
    reg_submit_btn:    'Enviar solicitud de acceso',

    // Confirmación
    reg_conf_title:    'Solicitud recibida',
    reg_conf_desc:     'Hemos recibido tu solicitud correctamente.',
    reg_conf_numlabel: 'Tu número de solicitud',
    reg_conf_emaillabel: 'Email de confirmación enviado a:',
    reg_conf_tl1:      'Solicitud recibida',
    reg_conf_tl2:      'Revisión por el administrador (24-48h)',
    reg_conf_tl3:      'Verificación de documento',
    reg_conf_tl4:      'Aprobación y bienvenida',
    reg_conf_footer_pre: 'La administración revisará tu solicitud en un plazo máximo de',
    reg_conf_footer_strong: '48 horas laborables',
    reg_conf_btn:      'Volver al inicio',

    // Modal recuperar contraseña
    forgot_eyebrow:    'Recuperar acceso',
    forgot_title:      '¿Olvidaste tu contraseña?',
    forgot_desc:       'Introduce tu correo y te enviaremos un enlace para crear una nueva contraseña.',
    forgot_cancel:     'Cancelar',
    forgot_send:       'Enviar enlace',
    forgot_step2_title:'Revisa tu correo',
    forgot_step2_pre:  'Si',
    forgot_step2_post: 'está registrado, recibirás un enlace en los próximos minutos.',
    forgot_step2_spam: 'Revisa también la carpeta de spam.',
    forgot_understood: 'Entendido',

    // Errores de validación del registro (JS)
    err_nombre_completo: 'Introduce tu nombre completo',
    err_apellidos:       'Introduce tus apellidos',
    err_email_valido:    'Introduce un email válido',
    err_telefono_valido: 'Introduce un teléfono válido',
    err_pw_min:          'Mínimo 8 caracteres',
    err_pw_reglas:       'Incluye mayúscula, minúscula, número y símbolo',
    err_pw_no_coincide:  'Las contraseñas no coinciden',
    err_doctipo:         'Selecciona el tipo de documento',
    err_docnum:          'Introduce el número de documento',
    err_fecha_completa:  'Introduce tu fecha de nacimiento completa',
    err_edad_min:        'Debes tener al menos 13 años',
    err_nacionalidad:    'Selecciona tu nacionalidad',
    err_paisnac:         'Selecciona tu país de nacimiento',
    err_upload_doc:      'Sube tu documento de identidad',
    err_ck_verdad:       'Debes confirmar que los datos son verídicos',
    err_ck_todos:        'Debes aceptar todos los consentimientos para continuar',
    err_paisres:         'Selecciona tu país de residencia',
    err_ciudad:          'Introduce tu ciudad',
    err_cp_valido:       'Introduce un código postal válido',
    err_direccion:       'Introduce tu dirección',
    err_registro_generico: 'Error al registrar. Inténtalo de nuevo.',
    reg_enviando:        'Enviando solicitud...',
    err_file_5mb:        'El archivo no puede superar 5MB',
    err_file_formato:    'Solo se aceptan JPG, PNG o PDF',

    // Resumen paso 4
    sum_datos_personales: 'Datos personales',
    sum_nombre:  'Nombre',
    sum_email:   'Email',
    sum_telefono:'Teléfono',
    sum_edad:    'Edad',
    sum_anios:   'años',
    sum_documento: 'Documento de identidad',
    sum_tipo:    'Tipo',
    sum_numero:  'Número',
    sum_archivo: 'Archivo',
    sum_residencia: 'Residencia',
    sum_pais:    'País',
    sum_ciudad:  'Ciudad',
    sum_cp:      'Código postal',
    sum_comunidad: 'Comunidad',
  },

  en: {
    // Navigation
    nav_home:         'Home',
    nav_eventos:      'Events',
    nav_calendario:   'Hebrew Calendar',
    nav_noticias:     'News',
    nav_shiurim:      'Shiurim',
    nav_rav:          'Ask the Rabbi',
    nav_wallap:       'Wallap',
    nav_kosher:       'Kosher',
    nav_business:     'Jewish Business',
    nav_donativos:    'Donations',
    nav_galeria:      'Gallery',
    nav_professionals:'Professionals',
    nav_voluntariado: 'Volunteering',
    nav_citas:        'Rabbi Appointment',
    nav_contacto:     'Contact',
    nav_siddur:       'Siddur',
    nav_servicios:    'Services',
    nav_perfil:       'My profile',
    nav_admin:        'Administration',
    nav_logout:       'Sign out',
    nav_more:         'More',

    // Nav groups
    group_principal:  'Main',
    group_comunidad:  'Community',
    group_esencial:   'Essential',
    group_servicios:  'Services',
    group_tefila:     'Tefila',
    group_cuenta:     'My account',
    group_mas:        'More',

    // Nav extra
    nav_comunidad:    '{{labels.businessEn}}',
    nav_rav_hub:      'Torá y Comunidad',
    nav_esencial:     '{{labels.services}}',
    nav_mikve:        'Mikve',

    // Common
    save:             'Save changes',
    cancel:           'Cancel',
    back:             'Back',
    back_home:        'Back to home',
    edit:             'Edit',
    loading:          'Loading...',
    ver_mas:          'See more',
    ver_todo:         'See all',
    inscribirse:      'Register',
    inscrito:         'Registered',

    // Home
    home_greeting:       'Shalom',
    home_shabbat:        'This week\'s Shabbat',
    home_quick:          'Quick access',
    home_quick_rav:      'Ask Rabbi',
    home_quick_cal:      'Hebrew Cal.',
    home_banner_manage:  'Manage',
    home_eventos:        'Upcoming events',
    home_noticias:       'Latest news',
    home_sinagoga:       'Today at the synagogue',

    // Events (dynamic)
    ev_completo:    'Full',
    ev_pocas:       'Only {n} spots left!',
    ev_plazas:      '{n} spots available',

    // Profile
    perfil_title:     'My profile',
    perfil_label:     'My account',
    perfil_personal:  'Personal information',
    perfil_address:   'Address',
    perfil_comunidad: 'Community',
    perfil_doc:       'Identity document',
    perfil_solicitud: 'Membership application',
    perfil_nombre:    'First name',
    perfil_apellidos: 'Last name',
    perfil_telefono:  'Phone',
    perfil_fechanac:  'Date of birth',
    perfil_nacional:  'Nationality',
    perfil_paisnac:   'Country of birth',
    perfil_pais:      'Country',
    perfil_ciudad:    'City',
    perfil_cp:        'Postal code',
    perfil_direccion: 'Address',
    perfil_practica:  'Religious practice',
    perfil_familiar:  'Family member in kehilá',
    perfil_conocio:   'How did you hear about us',
    perfil_doc_tipo:  'Type',
    perfil_doc_num:   'Number',
    perfil_photo:     'Change photo',
    perfil_saved:     'Profile updated',
    perfil_nodata:    'Not provided',

    // Admin
    admin_title:      'Control Panel',
    admin_subtitle:   'Manage your community from here',
    admin_resumen:    'Overview',
    admin_usuarios:   'Users',
    admin_eventos:    'Events',
    admin_noticias:   'News',
    admin_market:     'Marketplace',
    admin_rav:        'Rabbi Q&A',
    admin_activos:    'Active users',
    admin_pendientes: 'Pending approval',
    admin_evmes:      'Events this month',
    admin_donativos:  'Donations received',
    admin_actividad:  'Recent activity',
    admin_aprobar:    'Approve',
    admin_rechazar:   'Reject',
    admin_suspender:  'Suspend',
    admin_banear:     'Ban',
    admin_reactivar:  'Reactivate',
    admin_ver:        'View application',

    // Status/roles
    status_active:    'Active',
    status_pending:   'Pending',
    status_banned:    'Banned',
    role_admin:       'Admin',
    role_mod:         'Mod.',
    role_miembro:     'Member',

    // Login
    login_title:      'Welcome back',
    login_subtitle:   'Access your community',
    login_email:      'Email address',
    login_password:   'Password',
    login_btn:        'Sign in',
    login_register:   'Not a member yet?',
    login_register2:  'Request access',

    // Registration
    reg_title:        'Request access',
    reg_step1:        'Account',
    reg_step2:        'Identity',
    reg_step3:        'Residence',
    reg_step4:        'Review',

    // Login — extra
    login_pretitle:    'Access',
    login_forgot:       'Forgot your password?',
    login_iniciar_sesion: 'Sign in',

    // Registration — shared buttons
    reg_btn_continuar: 'Continue',
    reg_btn_atras:     'Back',
    reg_opcional:      '(optional)',
    reg_selecciona:    'Select',
    reg_otro:          'Other',

    // Step 1
    reg_s1_pretitle:   'Step 1 of 4',
    reg_s1_title:      'Create your account',
    reg_s1_subtitle:   'Basic account information',
    reg_nombre:        'First name',
    reg_nombre_ph:     'As shown on your ID/passport',
    reg_apellidos:     'Last name',
    reg_apellidos_ph:  'Full last name',
    reg_email:         'Email address',
    reg_email_hint:    'You\'ll receive important updates here',
    reg_telefono:      'Phone',
    reg_telefono_hint: 'For verification and urgent community contact',
    reg_password:      'Password',
    reg_password_ph:   'Min. 8 characters',
    reg_confirm_pw:    'Confirm password',
    reg_confirm_pw_ph: 'Repeat your password',

    // Step 2
    reg_s2_pretitle:   'Step 2 of 4',
    reg_s2_title:      'Identity verification',
    reg_s2_subtitle:   'Required to protect community safety',
    reg_s2_banner:     'For the safety of all members, we verify every person\'s identity. Your information is treated with full confidentiality and is only accessible to community leadership.',
    reg_doctipo:       'Document type',
    reg_doctipo_ph:    'Select type',
    doc_dni:           'Spanish national ID (DNI)',
    doc_nie:           'NIE (Foreigner ID Number)',
    doc_pasaporte:     'Passport (any country)',
    doc_cedula:        'National identity card',
    doc_otro:          'Other official document',
    reg_docnum:        'Document number',
    reg_docnum_ph:     'Document number',
    reg_fechanac:      'Date of birth',
    reg_dia:           'Day',
    reg_mes:           'Month',
    reg_anio:          'Year',
    mes_1: 'January', mes_2: 'February', mes_3: 'March', mes_4: 'April',
    mes_5: 'May', mes_6: 'June', mes_7: 'July', mes_8: 'August',
    mes_9: 'September', mes_10: 'October', mes_11: 'November', mes_12: 'December',
    reg_nacionalidad:  'Nationality',
    reg_paisnac:       'Country of birth',
    pais_espana: 'Spain', pais_israel: 'Israel', pais_argentina: 'Argentina',
    pais_uruguay: 'Uruguay', pais_francia: 'France', pais_eeuu: 'United States',
    pais_mexico: 'Mexico', pais_venezuela: 'Venezuela', pais_colombia: 'Colombia',
    pais_brasil: 'Brazil', pais_reinounido: 'United Kingdom', pais_marruecos: 'Morocco',
    pais_otra: 'Other',
    reg_ck_verdad:     'I confirm the information provided is truthful. I understand that providing false information results in a permanent denial of access.',

    // Step 3
    reg_s3_pretitle:   'Step 3 of 4',
    reg_s3_title:      'Residence information',
    reg_s3_subtitle:   'To assign you to your local community',
    reg_paisres:       'Country of residence',
    reg_paisres_ph:    'Select your country',
    reg_ciudad:        'City',
    reg_ciudad_ph:     'Your city',
    reg_cp:            'Postal code',
    reg_cp_ph:         'E.g. 28001',
    reg_cp_hint:       'To send you info about nearby events',
    reg_direccion:     'Address',
    reg_direccion_ph:  'Street and number',
    reg_direccion_hint:'Not shared with other members',
    reg_familiar:      'Do you have family in the community?',
    reg_familiar_ck:   'Yes, I have a family member who is a member',
    reg_familiar_ph:   'Family member\'s name',
    reg_familiar_hint: 'Helps speed up your verification',

    // Step 4
    reg_s4_pretitle:   'Step 4 of 4',
    reg_s4_title:      'Final review',
    reg_s4_subtitle:   'Confirm your details before submitting',
    reg_modificar:     'Edit information',
    reg_ck1_pre:       'I have read and accept the',
    reg_ck1_link:      'Terms of Use and Community Guidelines',
    reg_ck1_post:      'of the {{name}} community.',
    reg_ck2_pre:       'I accept the',
    reg_ck2_link:      'Privacy Policy',
    reg_ck2_post:      'and the processing of my personal data under GDPR.',
    reg_ck3:           'I understand my request will be reviewed manually by the administration and that access is not automatic or guaranteed.',
    reg_ck4:           'I confirm that I am Jewish or have a direct connection to the Jewish community, and that my interest is to participate positively in community life.',
    reg_declaration:   'By submitting this request, I declare under my own responsibility that all information provided is truthful. I understand that any falsehood results in a permanent denial of access.',
    reg_submit_btn:    'Submit access request',

    // Confirmation
    reg_conf_title:    'Request received',
    reg_conf_desc:     'We\'ve successfully received your request.',
    reg_conf_numlabel: 'Your request number',
    reg_conf_emaillabel: 'Confirmation email sent to:',
    reg_conf_tl1:      'Request received',
    reg_conf_tl2:      'Review by administrator (24-48h)',
    reg_conf_tl3:      'Document verification',
    reg_conf_tl4:      'Approval and welcome',
    reg_conf_footer_pre: 'The administration will review your request within a maximum of',
    reg_conf_footer_strong: '48 business hours',
    reg_conf_btn:      'Back to home',

    // Forgot password modal
    forgot_eyebrow:    'Recover access',
    forgot_title:      'Forgot your password?',
    forgot_desc:       'Enter your email and we\'ll send you a link to create a new password.',
    forgot_cancel:     'Cancel',
    forgot_send:       'Send link',
    forgot_step2_title:'Check your email',
    forgot_step2_pre:  'If',
    forgot_step2_post: 'is registered, you\'ll receive a link within a few minutes.',
    forgot_step2_spam: 'Also check your spam folder.',
    forgot_understood: 'Got it',

    // Registration JS validation errors
    err_nombre_completo: 'Enter your full first name',
    err_apellidos:       'Enter your last name',
    err_email_valido:    'Enter a valid email address',
    err_telefono_valido: 'Enter a valid phone number',
    err_pw_min:          'Minimum 8 characters',
    err_pw_reglas:       'Include an uppercase letter, lowercase letter, number and symbol',
    err_pw_no_coincide:  'Passwords do not match',
    err_doctipo:         'Select the document type',
    err_docnum:          'Enter the document number',
    err_fecha_completa:  'Enter your complete date of birth',
    err_edad_min:        'You must be at least 13 years old',
    err_nacionalidad:    'Select your nationality',
    err_paisnac:         'Select your country of birth',
    err_upload_doc:      'Upload your identity document',
    err_ck_verdad:       'You must confirm the information is truthful',
    err_ck_todos:        'You must accept all consents to continue',
    err_paisres:         'Select your country of residence',
    err_ciudad:          'Enter your city',
    err_cp_valido:       'Enter a valid postal code',
    err_direccion:       'Enter your address',
    err_registro_generico: 'Error registering. Please try again.',
    reg_enviando:        'Submitting request...',
    err_file_5mb:        'The file cannot exceed 5MB',
    err_file_formato:    'Only JPG, PNG or PDF files are accepted',

    // Step 4 summary
    sum_datos_personales: 'Personal details',
    sum_nombre:  'Name',
    sum_email:   'Email',
    sum_telefono:'Phone',
    sum_edad:    'Age',
    sum_anios:   'years old',
    sum_documento: 'Identity document',
    sum_tipo:    'Type',
    sum_numero:  'Number',
    sum_archivo: 'File',
    sum_residencia: 'Residence',
    sum_pais:    'Country',
    sum_ciudad:  'City',
    sum_cp:      'Postal code',
    sum_comunidad: 'Community',
  }
};

// ─── Core functions ───────────────────────────
const LANG_KEY = 'kehila_lang';

function getLang() {
  return localStorage.getItem(LANG_KEY) || 'es';
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  applyTranslations();
  updateLangToggle();
}

function t(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) ||
         (TRANSLATIONS['es'] && TRANSLATIONS['es'][key]) ||
         key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    if (attr) {
      el.setAttribute(attr, t(key));
    } else {
      el.textContent = t(key);
    }
  });
  // Update html lang attribute
  document.documentElement.lang = getLang() === 'en' ? 'en' : 'es';
}

function updateLangToggle() {
  const lang = getLang();
  const label = lang === 'es' ? 'EN' : 'ES';
  const title = lang === 'es' ? 'Switch to English' : 'Cambiar a Español';
  document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
    // Si el botón tiene un span interno (ej. junto a un icono SVG), solo
    // tocamos ese span — si le hacemos textContent al botón entero, se
    // borraría el icono también.
    const inner = btn.querySelector('.lang-toggle-label');
    if (inner) inner.textContent = label; else btn.textContent = label;
    btn.title = title;
  });
}

function toggleLang() {
  setLang(getLang() === 'es' ? 'en' : 'es');
  // Reconstruir solo el sidebar (no duplicar bottom nav ni hamburger)
  if (typeof buildSidebar === 'function') {
    const activeHref = document.querySelector('.nav-item.active')?.getAttribute('href') || '';
    const activeId = activeHref.replace('.html', '') || 'home';
    buildSidebar(activeId);
  }
  // Notify pages that render dynamic content via JS
  document.dispatchEvent(new Event('langchange'));
}

// Auto-apply on load
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  updateLangToggle();
});
