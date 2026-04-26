// ==========================================
// DICCIONARIOS CENTRALIZADOS SIFECH -> WIX
// ==========================================

const diccionarioCategorias = {
  "Primera Caballeros": "1ra Masc.",
  "1CABAL": "1ra Masc.",
  "Primera Damas": "1ra Fem.",
  "1DAMAS": "1ra Fem.",
  MAMIS: "Mamis",
  Mamis: "Mamis",
  RESERV: "Reserva",
  Reserva: "Reserva",
  "Sub 12 Femenino": "Sub 12 Fem.",
  SUB12F: "Sub 12 Fem.",
  "Sub 14 Femenino": "Sub 14 Fem.",
  SUB14F: "Sub 14 Fem.",
  "Sub 16 Femenino": "Sub 16 Fem.",
  SUB16F: "Sub 16 Fem.",
  "Sub 18 Femenino": "Sub 18 Fem.",
  SUB18F: "Sub 18 Fem.",
  "Sub 19 Femenino": "Sub 19 Fem.",
};

const diccionarioEquipos = {
  // Variantes en Mayúsculas (Tablas de Posiciones, Tarjetas, etc)
  "CLUB ATLÉTICO ESTUDIANTE": "CA. Estudiantes",
  SARMIENTO: "Sarmiento",
  "ASOSIACION CIVIL CHACO HOCKEY": "Asoc. Chaco Hockey",
  "REGATAS RESISTENCIA": "Regatas Resistencia",
  "CORRIENTES HOCKEY - CTES": "Corrientes Hockey",
  "CUNE C.UNIV. DEL NORDESTE": "CUNE",
  "CURNE - UN. RUGBY NORD": "CURNE",
  "FEDERACIÓN CHAQUEÑA DE HOCKEY": "Federación Chaqueña",
  "QUILMES - CTS": "Quilmes CTS",
  "SAN FERNANDO": "San Fernando",
  SELECCIONES: "Selecciones",
  "SIXTY RUGBY CLUB": "Sixty",
  "TACUARENDI STA FE": "Tacuarendí",
  "TARAGÜY RUGBY CLUB - CTES": "Taragüy",
  "CLUB ATLÉTICO BOLIDO VERDE": "CA. Bólido Verde",
  "VILLA ALVEAR": "Villa Alvear",
  NBCH: "NBCH",

  // Variantes Capitalizadas (Goleadores, Resultados, Fixture)
  "Club Atlético Estudiante": "CA. Estudiantes",
  Sarmiento: "Sarmiento",
  "Asosiacion Civil Chaco Hockey": "Asoc. Chaco Hockey",
  "Regatas Resistencia": "Regatas Resistencia",
  "CUNE C.Univ. del Nordeste": "CUNE",
  "CURNE - Un. Rugby Nord": "CURNE",
  "Federación Chaqueña de Hockey": "Federación Chaqueña",
  "San Fernando": "San Fernando",
  "Sixty Rugby Club": "Sixty",
  "Tacuarendi Sta Fe": "Tacuarendí",
  "Taragüy Rugby Club - CTES": "Taragüy",
  "Club Atlético Bolido Verde": "CA. Bólido Verde",
  "Villa Alvear": "Villa Alvear",

  // Abreviaciones Scriptcase
  SANFE: "San Fernando",
  CHOCK: "Corrientes Hockey",
  CRRHO: "CURNE",
  TACUA: "Tacuarendí",
  DONOR: "Don Orione",
  CHACO: "Asoc. Chaco Hockey",
  BODOM: "CA. Bólido Verde",
};

const diccionarioCanchas = {
  "Federación Chaqueña de Hockey": "Federación",
  CUNE: "CUNE",
  REGATAS: "Regatas",
  "SM CANCHA": "San Martín",
  "SIN CANCHA": "Cancha no asig.",
};

// Exportamos los tres diccionarios para que puedan ser usados en otros archivos
module.exports = {
  diccionarioCategorias,
  diccionarioEquipos,
  diccionarioCanchas,
};
