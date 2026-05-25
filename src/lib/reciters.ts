import { Reciter } from "@/types";

// Only reciters with verified segment data on the Quran.com API (IDs 1–12).
// Segment data is required for word-level highlight sync during playback.
export const reciters: Reciter[] = [
  { id: "alafasy",          name: "Mishary Rashid Alafasy",              folder: "Alafasy_128kbps",                        quranComRecitationId: 7  },
  { id: "sudais",           name: "Abdul Rahman Al-Sudais",              folder: "Abdurrahmaan_As-Sudais_192kbps",          quranComRecitationId: 3  },
  { id: "basit-murattal",   name: "Abdul Basit (Murattal)",              folder: "Abdul_Basit_Murattal_192kbps",            quranComRecitationId: 2  },
  { id: "basit-mujawwad",   name: "Abdul Basit (Mujawwad)",              folder: "Abdul_Basit_Mujawwad_128kbps",            quranComRecitationId: 1  },
  { id: "husary",           name: "Mahmoud Khalil Al-Husary",            folder: "Husary_128kbps",                         quranComRecitationId: 6  },
  { id: "minshawi-murattal",name: "Muhammad Al-Minshawi (Murattal)",     folder: "Minshawi_Murattal_128kbps",               quranComRecitationId: 9  },
  { id: "minshawi-mujawwad",name: "Muhammad Al-Minshawi (Mujawwad)",     folder: "Minshawy_Mujawwad_192kbps",              quranComRecitationId: 8  },
  { id: "shuraym",          name: "Saud Ash-Shuraym",                    folder: "Saood_ash-Shuraym_128kbps",               quranComRecitationId: 10 },
  { id: "shaatree",         name: "Abu Bakr Ash-Shaatree",               folder: "Abu_Bakr_Ash-Shaatree_128kbps",           quranComRecitationId: 4  },
  { id: "rifai",            name: "Hani Ar-Rifai",                       folder: "Hani_Rifai_192kbps",                     quranComRecitationId: 5  },
  { id: "tablawy",          name: "Muhammad Al-Tablawi",                 folder: "Mohammad_al_Tablaway_128kbps",            quranComRecitationId: 11 },
];
