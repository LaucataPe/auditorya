/**
 * Política de privacidad y de protección de datos personales del programa piloto.
 *
 * Texto del documento aprobado por COLKREA S.A.S. (versión 1.0, vigente desde el 24 de noviembre de
 * 2026; el borrador anterior nunca se publicó ni se aceptó). Es la fuente única: la página pública, la pantalla de
 * aceptación y el hash que se guarda en cada aceptación salen de aquí.
 *
 * Para modificarla: NO editar la versión vigente en el lugar. Subir `version`, cambiar el
 * texto y los usuarios volverán a aceptarla (cada aceptación guarda versión y hash).
 * Los marcadores `**texto**` solo dan negrilla al mostrarla.
 */

export type SeccionPolitica = { titulo: string | null; parrafos: string[] }

export const POLITICA_DATOS = {
  documento: 'politica_datos',
  version: '1.0',
  vigenteDesde: '2026-11-24',
  titulo: 'Política de privacidad y de protección de datos personales del programa piloto de AuditorYa',
  /** Texto exacto de la casilla de aceptación (numeral 9 de la política). */
  textoAceptacion:
    'Leí y acepto la Política de Privacidad y de Protección de Datos Personales del programa piloto de AuditorYa, y autorizo a COLKREA S.A.S. para tratar mis datos personales conforme a ella.',
  secciones: [
    {
      titulo: null,
      parrafos: [
        '**COLKREA S.A.S.**, sociedad por acciones simplificada legalmente constituida, identificada con NIT **901878495-9** y domiciliada en la ciudad de Bogotá, en cumplimiento de la Ley Estatutaria 1581 de 2012, del Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y de las demás normas concordantes, da a conocer la presente Política de Privacidad y de Protección de Datos Personales (en adelante la “Política”), aplicable de manera exclusiva al programa piloto de la plataforma **AuditorYa** (en adelante el “Piloto”).',
      ],
    },
    {
      titulo: '1. Identificación del Responsable del Tratamiento',
      parrafos: [
        'Razón social: COLKREA S.A.S.',
        'NIT: 901.878.495-9',
        'Domicilio: Bogotá D.C., Colombia.',
        'Dirección física: CR 17A #116-15',
        'Correo electrónico: colkreasas@gmail.com',
        'Teléfono: 313 382 3170',
      ],
    },
    {
      titulo: '2. Ámbito de aplicación',
      parrafos: [
        'La presente Política regula la recolección, almacenamiento, uso, circulación, transmisión, supresión y, en general, el Tratamiento de los datos personales y de la información que se reciba en desarrollo del Piloto de AuditorYa, plataforma tecnológica para la gestión de encargos de auditoría.',
        'El Piloto es gratuito y está dirigido exclusivamente a firmas de auditoría y profesionales invitados por COLKREA S.A.S. (en adelante los “Participantes”). Tendrá una duración inicial de tres (3) meses contados a partir del registro en la plataforma, prorrogable mediante aviso enviado por correo electrónico a los Participantes.',
        'Durante el Piloto, los Participantes podrán gestionar en la plataforma encargos de auditoría de sus clientes, lo cual incluye cargar balances de prueba, papeles de trabajo y demás información de las empresas auditadas, así como llevar el control de sus clientes y del avance de cada encargo.',
      ],
    },
    {
      titulo: '3. Definiciones',
      parrafos: [
        'De acuerdo con la Ley 1581 de 2012 y sus decretos reglamentarios, y para efectos de esta Política, las siguientes palabras tendrán el significado que aquí se les asigna, se escriban o no en mayúsculas, en singular o en plural:',
        '**i) Autorización:** consentimiento previo, expreso e informado del Titular para llevar a cabo el Tratamiento de sus datos personales.',
        '**ii) Aviso de privacidad:** comunicación verbal o escrita generada por el Responsable, dirigida al Titular, mediante la cual se le informa sobre la existencia de las políticas de Tratamiento que le serán aplicables, la forma de acceder a ellas y las finalidades del Tratamiento.',
        '**iii) Base de datos:** conjunto organizado de datos personales que sea objeto de Tratamiento.',
        '**iv) Dato personal:** cualquier información vinculada o que pueda asociarse a una o varias personas naturales determinadas o determinables.',
        '**v) Dato sensible:** aquel que afecta la intimidad del Titular o cuyo uso indebido puede generar su discriminación, tales como los que revelen el origen racial o étnico, la orientación política, las convicciones religiosas o filosóficas, la pertenencia a sindicatos u organizaciones sociales, los datos relativos a la salud, a la vida sexual y los datos biométricos.',
        '**vi) Encargado del Tratamiento:** persona natural o jurídica, pública o privada, que por sí misma o en asocio con otros realice el Tratamiento de datos personales por cuenta del Responsable.',
        '**vii) Responsable del Tratamiento:** persona natural o jurídica, pública o privada, que por sí misma o en asocio con otros decida sobre la base de datos y/o el Tratamiento de los datos.',
        '**viii) Titular:** persona natural cuyos datos personales sean objeto de Tratamiento.',
        '**ix) Transmisión:** Tratamiento de datos personales que implica su comunicación dentro o fuera del territorio de la República de Colombia, cuando tenga por objeto la realización de un Tratamiento por el Encargado por cuenta del Responsable.',
        '**x) Tratamiento:** cualquier operación o conjunto de operaciones sobre datos personales, tales como la recolección, almacenamiento, uso, circulación o supresión.',
        '**xi) Participante:** firma de auditoría o profesional invitado al Piloto, así como las personas que esta autorice para usar la plataforma.',
        '**xii) Información de los Encargos:** documentos e información que el Participante carga en la plataforma en desarrollo de sus encargos de auditoría, incluidos balances de prueba, papeles de trabajo, manual de calidad e información de las empresas auditadas y de sus terceros.',
      ],
    },
    {
      titulo: '4. Principios',
      parrafos: [
        'En el Tratamiento de los datos personales, COLKREA S.A.S. aplicará de manera armónica e integral los principios rectores de la Ley 1581 de 2012:',
        '**Principio de finalidad:** el Tratamiento obedece a una finalidad legítima, informada al Titular.',
        '**Principio de libertad:** el Tratamiento solo puede ejercerse con el consentimiento previo, expreso e informado del Titular, salvo mandato legal o judicial que releve el consentimiento.',
        '**Principio de veracidad o calidad:** la información sujeta a Tratamiento debe ser veraz, completa, exacta, actualizada, comprobable y comprensible.',
        '**Principio de transparencia:** se garantiza el derecho del Titular a obtener, en cualquier momento y sin restricciones, información acerca de la existencia de datos que le conciernan.',
        '**Principio de acceso y circulación restringida:** el Tratamiento solo podrá hacerse por personas autorizadas por el Titular o por la ley. Los datos personales no estarán disponibles en internet ni en medios de divulgación masiva, salvo que el acceso sea técnicamente controlable.',
        '**Principio de seguridad:** la información se manejará con las medidas técnicas, humanas y administrativas necesarias para evitar su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento.',
        '**Principio de confidencialidad:** todas las personas que intervengan en el Tratamiento están obligadas a garantizar la reserva de la información, inclusive después de finalizada su relación con el Tratamiento.',
      ],
    },
    {
      titulo: '5. Calidad en la que actúa COLKREA S.A.S.',
      parrafos: [
        'Respecto de los datos personales de los Participantes y de las personas que ellos autoricen para usar la plataforma, COLKREA S.A.S. actúa como **Responsable del Tratamiento**.',
        'Respecto de los datos personales contenidos en la Información de los Encargos, el Participante es el Responsable del Tratamiento y COLKREA S.A.S. actúa como **Encargado del Tratamiento**, por cuenta y bajo las instrucciones del Participante. Lo dispuesto en esta Política para dicha información constituye el contrato de transmisión de datos personales entre el Participante y COLKREA S.A.S., en los términos del Decreto 1074 de 2015.',
      ],
    },
    {
      titulo: '6. Datos personales objeto de Tratamiento',
      parrafos: [
        'En desarrollo del Piloto, COLKREA S.A.S. tratará los siguientes datos:',
        '1. Datos de los Participantes: nombre, correo electrónico, teléfono, número de tarjeta profesional y firma.',
        '2. Información de los Encargos: balances de prueba, papeles de trabajo, manual de calidad, declaraciones tributarias, documentos e información de las empresas auditadas y de sus terceros que el Participante decida cargar.',
        '3. Información de uso de la plataforma y comentarios o retroalimentación que el Participante entregue sobre su experiencia.',
      ],
    },
    {
      titulo: '7. Finalidades del Tratamiento',
      parrafos: [
        'Los datos de los Participantes serán tratados para las siguientes finalidades: crear y administrar su cuenta; verificar su identidad y calidad profesional; prestar el servicio de la plataforma durante el Piloto; brindar soporte técnico; enviar comunicaciones relacionadas con el Piloto; solicitar retroalimentación sobre la experiencia de uso; y cumplir obligaciones legales.',
        'La Información de los Encargos será tratada únicamente para permitir al Participante gestionar sus encargos de auditoría dentro de la plataforma. COLKREA S.A.S. no la utilizará para fines propios, comerciales, publicitarios ni para el entrenamiento de modelos de inteligencia artificial.',
        'Para la mejora del producto, COLKREA S.A.S. utilizará exclusivamente la retroalimentación del Participante y la información sobre el uso y la usabilidad de la plataforma, sin acceder al contenido de los documentos cargados.',
      ],
    },
    {
      titulo: '8. Datos sensibles',
      parrafos: [
        'El Participante podrá cargar en la plataforma la información que sus encargos requieran, lo cual puede incluir datos sensibles de terceros. En tal caso, el Participante, como Responsable de dicha información, declara contar con la autorización expresa de los Titulares o con la habilitación legal correspondiente.',
        'COLKREA S.A.S. recomienda cargar únicamente la información estrictamente necesaria para cada encargo. Se informa a los Titulares que no están obligados a autorizar el Tratamiento de sus datos sensibles y que ninguna actividad podrá condicionarse a que los suministren.',
      ],
    },
    {
      titulo: '9. Autorización',
      parrafos: [
        'La autorización del Participante se obtendrá a más tardar al momento de su registro en la plataforma, mediante la aceptación expresa de esta Política a través de una casilla de verificación. COLKREA S.A.S. conservará prueba de la autorización, con registro de la fecha y hora de su otorgamiento. En ningún caso el silencio podrá asimilarse a una conducta inequívoca de autorización.',
        'El texto de aceptación será el siguiente: “Leí y acepto la Política de Privacidad y de Protección de Datos Personales del programa piloto de AuditorYa, y autorizo a COLKREA S.A.S. para tratar mis datos personales conforme a ella.”',
      ],
    },
    {
      titulo: '10. Transmisión de datos y proveedores tecnológicos',
      parrafos: [
        'COLKREA S.A.S. no vende, alquila ni cede a terceros los datos personales ni la Información de los Encargos. Para la operación del Piloto, la información podrá ser transmitida únicamente a los siguientes proveedores tecnológicos, que actúan por cuenta de COLKREA S.A.S.:',
        '1. Hostinger, proveedor de servidor privado virtual (VPS) ubicado en los Estados Unidos de América, donde se alojan la plataforma, las bases de datos y las copias de seguridad.',
        '2. OpenRouter, servicio que enruta las consultas de las funciones de inteligencia artificial de la plataforma hacia el modelo de lenguaje Gemini de Google. Las consultas se envían con la opción de proveedores que no retienen ni utilizan los datos para entrenar modelos.',
        '3. Mistral AI, únicamente cuando el Participante carga un documento escaneado o en un formato que exige reconocimiento óptico de caracteres (OCR) para leer sus cifras.',
        'Las funciones de inteligencia artificial se aplican así:',
        '- Antes de enviar una consulta, la plataforma reemplaza por códigos el nombre y el NIT de la empresa auditada, así como los correos electrónicos, los números de teléfono celular y los números de documento de identidad o de cuenta que se identifiquen como tales. Tampoco se envía el nombre de los archivos.',
        '- Por la naturaleza del texto libre, la plataforma no puede garantizar que detecte nombres de personas o de terceros escritos por el usuario en preguntas, notas o hallazgos. Por eso se recomienda al Participante no incluirlos.',
        '- Las declaraciones tributarias y demás documentos que el Participante cargue para que la plataforma lea sus cifras se procesan primero en el servidor de la plataforma (Hostinger). Cuando ese procesamiento no es suficiente, el documento se envía sin transformación a los proveedores de inteligencia artificial y de lectura indicados arriba, y puede contener datos de identificación de la empresa y de sus representantes.',
        '- El Participante puede desactivar las funciones de inteligencia artificial para toda su firma o para un cliente determinado; en ese caso la información no se envía a estos proveedores.',
        'Como consecuencia de lo anterior, los datos personales serán objeto de Transmisión internacional a los Estados Unidos de América y a otros países en los que operen estos proveedores, con la única finalidad de prestar el servicio del Piloto. COLKREA S.A.S. también podrá revelar información cuando así lo requieran autoridades públicas debidamente facultadas mediante orden administrativa o judicial.',
      ],
    },
    {
      titulo: '11. Obligaciones de COLKREA S.A.S. como Encargado',
      parrafos: [
        'Respecto de la Información de los Encargos, COLKREA S.A.S. se obliga a:',
        '1. Tratar la información únicamente para operar la plataforma durante el Piloto y conforme a las instrucciones del Participante.',
        '2. No acceder al contenido de la información, salvo (a) con autorización del Participante para brindar soporte, (b) cuando sea técnicamente necesario para el mantenimiento o la seguridad de la plataforma, o (c) por orden de autoridad competente.',
        '3. Guardar reserva de la información durante el Piloto y después de su terminación, y exigir el mismo compromiso a las personas y proveedores que intervengan en el Tratamiento.',
        '4. Adoptar las medidas de seguridad descritas en esta Política.',
        '5. Apoyar al Participante en la atención de las solicitudes de los Titulares, mediante la exportación, rectificación o supresión de la información, dentro de los cinco (5) días hábiles siguientes a la solicitud.',
        '6. Informar al Participante sobre cualquier incidente de seguridad que afecte la información.',
        '7. Devolver y suprimir la información a la terminación del Piloto, conforme al numeral 18 de esta Política.',
      ],
    },
    {
      titulo: '12. Declaraciones del Participante',
      parrafos: [
        'Con la aceptación de esta Política, el Participante declara que:',
        '1. Cuenta con la facultad y las autorizaciones necesarias de sus clientes y de los Titulares para cargar en la plataforma la Información de los Encargos.',
        '2. Cumple su propia política de tratamiento de datos personales y el deber de reserva propio de su ejercicio profesional.',
        '3. Cargará únicamente la información necesaria para el desarrollo de sus encargos.',
        '4. Conserva la responsabilidad profesional sobre cada encargo de auditoría gestionado en la plataforma.',
      ],
    },
    {
      titulo: '13. Confidencialidad',
      parrafos: [
        'COLKREA S.A.S. guardará estricta reserva sobre la información que el Participante cargue en la plataforma. A su vez, el Participante se compromete a no divulgar, sin autorización escrita de COLKREA S.A.S., la información no pública sobre AuditorYa a la que tenga acceso durante el Piloto, tal como funcionalidades en desarrollo, diseño, precios y documentación. Esta obligación de confidencialidad se mantendrá vigente después de la terminación del Piloto.',
      ],
    },
    {
      titulo: '14. Medidas de seguridad y carácter de prueba del Piloto',
      parrafos: [
        'COLKREA S.A.S. adoptará las medidas técnicas, humanas y administrativas razonables para proteger la información y evitar su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento. Entre ellas, realiza copias de seguridad semanales del servidor y copias locales de las bases de datos, y restringe el acceso a la plataforma al personal autorizado.',
        'En caso de presentarse un incidente de seguridad que afecte los datos personales, COLKREA S.A.S. informará a los Participantes afectados dentro de las setenta y dos (72) horas siguientes a su detección, y lo reportará a la Superintendencia de Industria y Comercio conforme a la ley.',
        'El Participante reconoce que AuditorYa se encuentra en etapa de prueba. Por esta razón, COLKREA S.A.S. no garantiza la disponibilidad permanente de la plataforma, su funcionamiento libre de errores ni la seguridad absoluta de la información, sin perjuicio de las obligaciones que le impone la ley y de la responsabilidad que esta no permita limitar.',
        'En consecuencia, COLKREA S.A.S. recomienda al Participante:',
        '1. Conservar siempre copia de sus documentos originales y papeles de trabajo fuera de la plataforma, sin utilizar AuditorYa como único medio de almacenamiento.',
        '2. Descargar periódicamente la información de sus encargos.',
        '3. Utilizar contraseñas seguras y únicas, y no compartir sus credenciales de acceso.',
        '4. Informar de inmediato a COLKREA S.A.S. sobre cualquier actividad sospechosa o acceso no autorizado.',
      ],
    },
    {
      titulo: '15. Derechos de los Titulares',
      parrafos: [
        'De conformidad con el artículo 8 de la Ley 1581 de 2012, los Titulares tienen derecho a:',
        '1. Conocer, actualizar y rectificar sus datos personales.',
        '2. Solicitar prueba de la autorización otorgada, salvo cuando esta no sea requerida por la ley.',
        '3. Ser informados, previa solicitud, sobre el uso que se ha dado a sus datos personales.',
        '4. Presentar ante la Superintendencia de Industria y Comercio quejas por infracciones a la ley.',
        '5. Revocar la autorización y/o solicitar la supresión de sus datos cuando no se respeten los principios, derechos y garantías constitucionales y legales.',
        '6. Acceder en forma gratuita a sus datos personales que hayan sido objeto de Tratamiento.',
        'Estos derechos podrán ser ejercidos por el Titular, sus causahabientes, su representante o apoderado, o por estipulación a favor de otro, previa acreditación de su identidad o calidad.',
        'Cuando se trate de datos contenidos en la Información de los Encargos, el Titular deberá dirigirse al Participante, en su calidad de Responsable. Si COLKREA S.A.S. recibe directamente una solicitud sobre dicha información, la trasladará al Participante en un término máximo de dos (2) días hábiles e informará de ello al interesado.',
      ],
    },
    {
      titulo: '16. Deberes de COLKREA S.A.S.',
      parrafos: [
        'En su calidad de Responsable o Encargado, según el caso, COLKREA S.A.S. cumplirá los deberes previstos en los artículos 17 y 18 de la Ley 1581 de 2012, entre ellos: garantizar al Titular el pleno y efectivo ejercicio del derecho de hábeas data; solicitar y conservar copia de la autorización; informar al Titular sobre la finalidad de la recolección y sus derechos; conservar la información bajo las condiciones de seguridad necesarias; actualizar y rectificar la información cuando corresponda; tramitar las consultas y reclamos en los términos de ley; informar a la Superintendencia de Industria y Comercio sobre violaciones a los códigos de seguridad; y cumplir las instrucciones que imparta dicha Superintendencia.',
      ],
    },
    {
      titulo: '17. Área responsable y procedimiento de consultas y reclamos',
      parrafos: [
        'La atención de peticiones, consultas y reclamos estará a cargo de Laura Pérez, a través del correo electrónico colkreasas@gmail.com o de la dirección física CR 17A #116-15 en Bogotá. Toda solicitud deberá incluir la identificación del Titular, la descripción de lo solicitado, una dirección de notificación y los documentos que acrediten su identidad o representación.',
        '**Consultas.** Serán atendidas en un término máximo de diez (10) días hábiles contados a partir del día siguiente a su recibo. Cuando no fuere posible atenderlas en dicho término, se informará al interesado los motivos de la demora y la fecha de respuesta, la cual no podrá superar los cinco (5) días hábiles siguientes al vencimiento del primer término.',
        '**Reclamos.** Si el reclamo resulta incompleto, se requerirá al interesado dentro de los cinco (5) días siguientes a su recepción para que subsane las fallas. Transcurridos dos (2) meses desde el requerimiento sin que se presente la información requerida, se entenderá que ha desistido del reclamo. Una vez recibido el reclamo completo, se incluirá en la base de datos la leyenda “reclamo en trámite” en un término no mayor a dos (2) días hábiles. El término máximo para atenderlo será de quince (15) días hábiles contados a partir del día siguiente a su recibo. Cuando no fuere posible atenderlo en dicho término, se informará al interesado los motivos de la demora y la fecha de respuesta, la cual no podrá superar los ocho (8) días hábiles siguientes al vencimiento del primer término.',
        'El Titular solo podrá elevar queja ante la Superintendencia de Industria y Comercio una vez haya agotado el trámite de consulta o reclamo ante COLKREA S.A.S.',
      ],
    },
    {
      titulo: '18. Terminación del Piloto, devolución y supresión de la información',
      parrafos: [
        'El Participante podrá retirarse del Piloto en cualquier momento mediante solicitud enviada al correo electrónico indicado en esta Política. COLKREA S.A.S. podrá dar por terminado el Piloto o la participación de un Participante con un aviso previo de quince (15) días calendario, salvo incumplimiento grave o riesgo para la seguridad de la plataforma.',
        'Si el Participante continúa utilizando AuditorYa una vez finalizado el Piloto, su información se conservará mientras se mantenga el uso de la herramienta.',
        'Si el Participante se retira o no continúa con la herramienta, COLKREA S.A.S. le entregará, en un formato descargable, la información cargada y la información de cada encargo realizado en la plataforma, dentro de los quince (15) días siguientes. Posteriormente suprimirá la información de la plataforma dentro de los sesenta (60) días siguientes, de manera que no permita su recuperación. Las copias de seguridad se sobrescribirán en su ciclo ordinario, en un plazo máximo de 7 días.',
        'La supresión no procederá cuando exista un deber legal o contractual de conservar la información. COLKREA S.A.S. podrá conservar la retroalimentación entregada por el Participante sobre su experiencia en el Piloto, sin documentos ni Información de los Encargos.',
      ],
    },
    {
      titulo: '19. Modificación de la Política',
      parrafos: [
        'COLKREA S.A.S. podrá modificar esta Política. Los cambios sustanciales serán informados a los Participantes por correo electrónico con al menos diez (10) días de anticipación a su entrada en vigencia. Si el Participante no está de acuerdo con los cambios, podrá retirarse del Piloto en los términos del numeral 18.',
      ],
    },
    {
      titulo: '20. Vigencia de la Política y de las bases de datos',
      parrafos: [
        'La presente Política entra en vigencia a partir del 24 de noviembre de 2026 y se aplicará durante el tiempo que dure el Piloto. Las bases de datos del Piloto permanecerán vigentes mientras se mantenga la finalidad para la cual fueron recolectados los datos, conforme a lo previsto en el numeral 18.',
        'Versión 1.0.',
      ],
    },
  ] satisfies SeccionPolitica[],
} as const

/** Contenido que se aceptó, serializado de forma estable para calcular su hash. */
export function contenidoPolitica(): string {
  return JSON.stringify({
    v: POLITICA_DATOS.version,
    t: POLITICA_DATOS.titulo,
    a: POLITICA_DATOS.textoAceptacion,
    s: POLITICA_DATOS.secciones,
  })
}
