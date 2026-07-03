/**
 * Catálogo base de actividades CIIU (Rev. 4 A.C. — Colombia), a nivel de clase (4 dígitos).
 * Es un subconjunto curado y ampliable para el buscador de actividad económica.
 * El sector se deriva siempre del código (ver ciiu.ts), así que cualquier código válido
 * funciona aunque no esté en esta lista.
 */
export type ActividadCiiu = { codigo: string; descripcion: string }

export const CIIU_CATALOGO: ActividadCiiu[] = [
  // A — Agricultura, ganadería, pesca
  { codigo: '0111', descripcion: 'Cultivo de cereales (excepto arroz), legumbres y semillas oleaginosas' },
  { codigo: '0113', descripcion: 'Cultivo de hortalizas, raíces y tubérculos' },
  { codigo: '0119', descripcion: 'Otros cultivos transitorios' },
  { codigo: '0121', descripcion: 'Cultivo de frutas tropicales y subtropicales' },
  { codigo: '0126', descripcion: 'Cultivo de palma para aceite y otros frutos oleaginosos' },
  { codigo: '0141', descripcion: 'Cría de ganado bovino y bufalino' },
  { codigo: '0151', descripcion: 'Cría de aves de corral' },
  { codigo: '0163', descripcion: 'Actividades de apoyo a la agricultura' },
  { codigo: '0210', descripcion: 'Silvicultura y otras actividades forestales' },
  { codigo: '0311', descripcion: 'Pesca marítima' },
  { codigo: '0321', descripcion: 'Acuicultura marítima' },

  // B — Minería
  { codigo: '0510', descripcion: 'Extracción de hulla (carbón de piedra)' },
  { codigo: '0710', descripcion: 'Extracción de minerales de hierro' },
  { codigo: '0729', descripcion: 'Extracción de otros minerales metalíferos no ferrosos' },
  { codigo: '0811', descripcion: 'Extracción de piedra, arena y arcillas comunes' },
  { codigo: '0910', descripcion: 'Actividades de apoyo para la extracción de petróleo y gas natural' },

  // C — Industria manufacturera
  { codigo: '1011', descripcion: 'Procesamiento y conservación de carne y productos cárnicos' },
  { codigo: '1020', descripcion: 'Procesamiento y conservación de frutas, legumbres, hortalizas y tubérculos' },
  { codigo: '1030', descripcion: 'Elaboración de aceites y grasas de origen vegetal y animal' },
  { codigo: '1040', descripcion: 'Elaboración de productos lácteos' },
  { codigo: '1051', descripcion: 'Elaboración de productos de molinería' },
  { codigo: '1061', descripcion: 'Trilla de café' },
  { codigo: '1063', descripcion: 'Tostión y molienda de café' },
  { codigo: '1081', descripcion: 'Elaboración de productos de panadería' },
  { codigo: '1104', descripcion: 'Elaboración de bebidas no alcohólicas; producción de aguas minerales' },
  { codigo: '1311', descripcion: 'Preparación e hilatura de fibras textiles' },
  { codigo: '1410', descripcion: 'Confección de prendas de vestir, excepto prendas de piel' },
  { codigo: '1521', descripcion: 'Fabricación de calzado de cuero y piel' },
  { codigo: '1811', descripcion: 'Actividades de impresión' },
  { codigo: '2011', descripcion: 'Fabricación de sustancias y productos químicos básicos' },
  { codigo: '2100', descripcion: 'Fabricación de productos farmacéuticos y medicinales' },
  { codigo: '2220', descripcion: 'Fabricación de productos de plástico' },
  { codigo: '2310', descripcion: 'Fabricación de vidrio y productos de vidrio' },
  { codigo: '2395', descripcion: 'Fabricación de artículos de hormigón, cemento y yeso' },
  { codigo: '2410', descripcion: 'Industrias básicas de hierro y de acero' },
  { codigo: '2511', descripcion: 'Fabricación de productos metálicos para uso estructural' },
  { codigo: '3110', descripcion: 'Fabricación de muebles' },

  // D/E — Energía, agua, residuos
  { codigo: '3511', descripcion: 'Generación de energía eléctrica' },
  { codigo: '3600', descripcion: 'Captación, tratamiento y distribución de agua' },
  { codigo: '3811', descripcion: 'Recolección de desechos no peligrosos' },

  // F — Construcción
  { codigo: '4111', descripcion: 'Construcción de edificios residenciales' },
  { codigo: '4112', descripcion: 'Construcción de edificios no residenciales' },
  { codigo: '4210', descripcion: 'Construcción de carreteras y vías de ferrocarril' },
  { codigo: '4220', descripcion: 'Construcción de proyectos de servicio público' },
  { codigo: '4290', descripcion: 'Construcción de otras obras de ingeniería civil' },
  { codigo: '4321', descripcion: 'Instalaciones eléctricas' },
  { codigo: '4330', descripcion: 'Terminación y acabado de edificios y obras de ingeniería civil' },

  // G — Comercio
  { codigo: '4511', descripcion: 'Comercio de vehículos automotores nuevos' },
  { codigo: '4520', descripcion: 'Mantenimiento y reparación de vehículos automotores' },
  { codigo: '4530', descripcion: 'Comercio de partes, piezas y accesorios para vehículos' },
  { codigo: '4631', descripcion: 'Comercio al por mayor de productos alimenticios' },
  { codigo: '4645', descripcion: 'Comercio al por mayor de productos farmacéuticos' },
  { codigo: '4651', descripcion: 'Comercio al por mayor de computadores y equipos periféricos' },
  { codigo: '4659', descripcion: 'Comercio al por mayor de otros tipos de maquinaria y equipo' },
  { codigo: '4711', descripcion: 'Comercio al por menor en establecimientos no especializados (principalmente alimentos y bebidas)' },
  { codigo: '4719', descripcion: 'Comercio al por menor en establecimientos no especializados (otros productos)' },
  { codigo: '4731', descripcion: 'Comercio al por menor de combustible para automotores' },
  { codigo: '4772', descripcion: 'Comercio al por menor de productos farmacéuticos y medicinales' },
  { codigo: '4791', descripcion: 'Comercio al por menor realizado a través de internet' },

  // H — Transporte y almacenamiento
  { codigo: '4921', descripcion: 'Transporte de pasajeros' },
  { codigo: '4923', descripcion: 'Transporte de carga por carretera' },
  { codigo: '5021', descripcion: 'Transporte fluvial de pasajeros' },
  { codigo: '5111', descripcion: 'Transporte aéreo nacional de pasajeros' },
  { codigo: '5210', descripcion: 'Almacenamiento y depósito' },
  { codigo: '5229', descripcion: 'Otras actividades complementarias al transporte' },

  // I — Alojamiento y comida
  { codigo: '5511', descripcion: 'Alojamiento en hoteles' },
  { codigo: '5611', descripcion: 'Expendio a la mesa de comidas preparadas (restaurantes)' },

  // J — Información y comunicaciones
  { codigo: '5811', descripcion: 'Edición de libros' },
  { codigo: '5813', descripcion: 'Edición de periódicos, revistas y otras publicaciones periódicas' },
  { codigo: '5820', descripcion: 'Edición de programas de informática (software)' },
  { codigo: '5911', descripcion: 'Actividades de producción de películas, videos, programas y comerciales de televisión' },
  { codigo: '5912', descripcion: 'Actividades de posproducción de películas, videos y programas de televisión' },
  { codigo: '5913', descripcion: 'Actividades de distribución de películas, videos y programas de televisión' },
  { codigo: '5914', descripcion: 'Actividades de exhibición de películas y videos' },
  { codigo: '5920', descripcion: 'Actividades de grabación de sonido y edición de música' },
  { codigo: '6010', descripcion: 'Actividades de programación y transmisión en el servicio de radio' },
  { codigo: '6020', descripcion: 'Actividades de programación y transmisión de televisión' },
  { codigo: '6110', descripcion: 'Actividades de telecomunicaciones alámbricas' },
  { codigo: '6120', descripcion: 'Actividades de telecomunicaciones inalámbricas' },
  { codigo: '6201', descripcion: 'Actividades de desarrollo de sistemas informáticos (software a la medida)' },
  { codigo: '6202', descripcion: 'Actividades de consultoría informática y gestión de instalaciones informáticas' },
  { codigo: '6311', descripcion: 'Procesamiento de datos y alojamiento (hosting)' },
  { codigo: '6391', descripcion: 'Actividades de agencias de noticias' },

  // K — Financieras y seguros
  { codigo: '6421', descripcion: 'Bancos comerciales' },
  { codigo: '6492', descripcion: 'Cooperativas, fondos de empleados y otras formas asociativas' },
  { codigo: '6512', descripcion: 'Seguros generales' },

  // L — Inmobiliarias
  { codigo: '6810', descripcion: 'Actividades inmobiliarias con bienes propios o arrendados' },
  { codigo: '6820', descripcion: 'Actividades inmobiliarias a cambio de una retribución o por contrata' },

  // M — Profesionales, científicas y técnicas
  { codigo: '6910', descripcion: 'Actividades jurídicas' },
  { codigo: '6920', descripcion: 'Contabilidad, teneduría de libros, auditoría financiera y asesoría tributaria' },
  { codigo: '7010', descripcion: 'Actividades de administración empresarial' },
  { codigo: '7020', descripcion: 'Actividades de consultoría de gestión' },
  { codigo: '7110', descripcion: 'Actividades de arquitectura e ingeniería y consultoría técnica' },
  { codigo: '7310', descripcion: 'Publicidad' },

  // N — Servicios administrativos y de apoyo
  { codigo: '7710', descripcion: 'Alquiler y arrendamiento de vehículos automotores' },
  { codigo: '7820', descripcion: 'Actividades de empresas de empleo temporal' },
  { codigo: '8010', descripcion: 'Actividades de seguridad privada' },
  { codigo: '8121', descripcion: 'Limpieza general interior de edificios' },

  // P — Educación
  { codigo: '8513', descripcion: 'Educación básica secundaria' },
  { codigo: '8541', descripcion: 'Educación técnica profesional' },
  { codigo: '8543', descripcion: 'Educación de instituciones universitarias o escuelas tecnológicas' },

  // Q — Salud
  { codigo: '8610', descripcion: 'Actividades de hospitales y clínicas con internación' },
  { codigo: '8621', descripcion: 'Actividades de la práctica médica sin internación' },
  { codigo: '8622', descripcion: 'Actividades de la práctica odontológica' },

  // R/S — Arte, entretenimiento y otros servicios
  { codigo: '9311', descripcion: 'Gestión de instalaciones deportivas' },
  { codigo: '9511', descripcion: 'Mantenimiento y reparación de computadores y equipo periférico' },
  { codigo: '9602', descripcion: 'Peluquería y otros tratamientos de belleza' },
  { codigo: '9609', descripcion: 'Otras actividades de servicios personales' },
]
