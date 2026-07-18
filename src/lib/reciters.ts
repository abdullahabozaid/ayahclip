import { Reciter, type ReciterAudioSource } from "@/types";

const EVERYAYAH_ATTRIBUTION = {
  label: "EveryAyah.com",
  url: "https://everyayah.com",
  usageNote: "Audio remains hosted by its upstream source and is subject to the upstream recording terms.",
  removalContact: "https://everyayah.com",
} as const;

const MP3QURAN_ATTRIBUTION = {
  label: "MP3Quran.net",
  url: "https://mp3quran.net",
  usageNote: "Chapter audio and ayah cues are streamed from MP3Quran under its published developer policy.",
  removalContact: "https://www.mp3quran.net/ar/contact-us",
} as const;

function everyAyah(folder: string): ReciterAudioSource {
  return {
    kind: "everyayah",
    folder,
    attribution: EVERYAYAH_ATTRIBUTION,
  };
}

function mp3QuranChapter(readId: number, server: string): ReciterAudioSource {
  return {
    kind: "chapter-cues",
    provider: "mp3quran",
    readId,
    server,
    attribution: MP3QURAN_ATTRIBUTION,
  };
}

export const RECITER_REGIONS: ReadonlyArray<{
  id: Reciter["region"];
  label: string;
  description: string;
}> = [
  { id: "haramain", label: "Makkah & Madinah", description: "Imams and reciters of the Two Holy Mosques" },
  { id: "egypt", label: "Egyptian masters", description: "Murattal, Mujawwad and teaching recordings" },
  { id: "gulf", label: "Gulf reciters", description: "Contemporary reciters from across the Gulf" },
  { id: "levant", label: "Levant", description: "Reciters and teachers from the Levant" },
  { id: "international", label: "Around the world", description: "Distinct recitation traditions beyond the Arab world" },
] as const;

/**
 * Verse-level sources verified against EveryAyah's public directory. The
 * Quran.com timing id is intentionally optional: only its documented subset
 * supports word-synced splitting. Every entry still supports whole-verse
 * playback, preview and export.
 */
export const reciters: Reciter[] = [
  { id: "juhany", name: "Abdullah Awad Al-Juhany", arabicName: "عبد الله عواد الجهني", audioSource: everyAyah("Abdullaah_3awwaad_Al-Juhaynee_128kbps"), region: "haramain", style: "Murattal" },
  { id: "abdullah-buaijan", name: "Abdullah Al-Buaijan", arabicName: "عبد الله البعيجان", audioSource: mp3QuranChapter(58, "https://server8.mp3quran.net/buajan/"), region: "haramain", style: "Murattal" },
  { id: "sudais", name: "Abdul Rahman Al-Sudais", arabicName: "عبد الرحمن السديس", audioSource: everyAyah("Abdurrahmaan_As-Sudais_192kbps"), region: "haramain", style: "Murattal", quranComRecitationId: 3 },
  { id: "ali-jaber", name: "Ali Jaber", arabicName: "علي جابر", audioSource: everyAyah("Ali_Jaber_64kbps"), region: "haramain", style: "Murattal" },
  { id: "hudhaify", name: "Ali Al-Hudhaify", arabicName: "علي الحذيفي", audioSource: everyAyah("Hudhaify_128kbps"), region: "haramain", style: "Murattal" },
  { id: "ibrahim-akhdar", name: "Ibrahim Al-Akhdar", arabicName: "إبراهيم الأخضر", audioSource: everyAyah("Ibrahim_Akhdar_32kbps"), region: "haramain", style: "Murattal" },
  { id: "maher-muaiqly", name: "Maher Al-Muaiqly", arabicName: "ماهر المعيقلي", audioSource: everyAyah("MaherAlMuaiqly128kbps"), region: "haramain", style: "Murattal" },
  { id: "muhammad-ayyub", name: "Muhammad Ayyub", arabicName: "محمد أيوب", audioSource: everyAyah("Muhammad_Ayyoub_128kbps"), region: "haramain", style: "Murattal" },
  { id: "muhsin-qasim", name: "Muhsin Al-Qasim", arabicName: "محسن القاسم", audioSource: everyAyah("Muhsin_Al_Qasim_192kbps"), region: "haramain", style: "Murattal" },
  { id: "salah-budair", name: "Salah Al-Budair", arabicName: "صلاح البدير", audioSource: everyAyah("Salah_Al_Budair_128kbps"), region: "haramain", style: "Murattal" },
  { id: "shuraym", name: "Saud Ash-Shuraym", arabicName: "سعود الشريم", audioSource: everyAyah("Saood_ash-Shuraym_128kbps"), region: "haramain", style: "Murattal", quranComRecitationId: 10 },
  { id: "bandar-balilah", name: "Bandar Balilah", arabicName: "بندر بليله", audioSource: mp3QuranChapter(217, "https://server6.mp3quran.net/balilah/"), region: "haramain", style: "Murattal" },

  { id: "basit-murattal", name: "Abdul Basit (Murattal)", arabicName: "عبد الباسط عبد الصمد", audioSource: everyAyah("Abdul_Basit_Murattal_192kbps"), region: "egypt", style: "Murattal", quranComRecitationId: 2 },
  { id: "basit-mujawwad", name: "Abdul Basit (Mujawwad)", arabicName: "عبد الباسط عبد الصمد", audioSource: everyAyah("Abdul_Basit_Mujawwad_128kbps"), region: "egypt", style: "Mujawwad", quranComRecitationId: 1 },
  { id: "ahmed-neana", name: "Ahmed Neana", arabicName: "أحمد نعينع", audioSource: everyAyah("Ahmed_Neana_128kbps"), region: "egypt", style: "Mujawwad" },
  { id: "ali-suwaisi", name: "Ali Hajjaj Al-Suwaisi", arabicName: "علي حجاج السويسي", audioSource: everyAyah("Ali_Hajjaj_AlSuesy_128kbps"), region: "egypt", style: "Mujawwad" },
  { id: "husary", name: "Mahmoud Khalil Al-Husary", arabicName: "محمود خليل الحصري", audioSource: everyAyah("Husary_128kbps"), region: "egypt", style: "Murattal", quranComRecitationId: 6 },
  { id: "husary-mujawwad", name: "Mahmoud Khalil Al-Husary (Mujawwad)", arabicName: "محمود خليل الحصري", audioSource: everyAyah("Husary_128kbps_Mujawwad"), region: "egypt", style: "Mujawwad" },
  { id: "husary-muallim", name: "Mahmoud Khalil Al-Husary (Muallim)", arabicName: "محمود خليل الحصري", audioSource: everyAyah("Husary_Muallim_128kbps"), region: "egypt", style: "Muallim", quranComRecitationId: 12 },
  { id: "minshawi-murattal", name: "Muhammad Al-Minshawi (Murattal)", arabicName: "محمد صديق المنشاوي", audioSource: everyAyah("Minshawy_Murattal_128kbps"), region: "egypt", style: "Murattal", quranComRecitationId: 9 },
  { id: "minshawi-mujawwad", name: "Muhammad Al-Minshawi (Mujawwad)", arabicName: "محمد صديق المنشاوي", audioSource: everyAyah("Minshawy_Mujawwad_192kbps"), region: "egypt", style: "Mujawwad", quranComRecitationId: 8 },
  { id: "minshawi-muallim", name: "Muhammad Al-Minshawi (Muallim)", arabicName: "محمد صديق المنشاوي", audioSource: everyAyah("Minshawy_Teacher_128kbps"), region: "egypt", style: "Muallim" },
  { id: "tablawy", name: "Muhammad Al-Tablawi", arabicName: "محمد محمود الطبلاوي", audioSource: everyAyah("Mohammad_al_Tablaway_128kbps"), region: "egypt", style: "Mujawwad", quranComRecitationId: 11 },
  { id: "muhammad-jibreel", name: "Muhammad Jibreel", arabicName: "محمد جبريل", audioSource: everyAyah("Muhammad_Jibreel_128kbps"), region: "egypt", style: "Murattal" },
  { id: "mustafa-ismail", name: "Mustafa Ismail", arabicName: "مصطفى إسماعيل", audioSource: everyAyah("Mustafa_Ismail_48kbps"), region: "egypt", style: "Mujawwad" },
  { id: "mahmoud-banna", name: "Mahmoud Ali Al-Banna", arabicName: "محمود علي البنا", audioSource: everyAyah("mahmoud_ali_al_banna_32kbps"), region: "egypt", style: "Mujawwad" },

  { id: "alafasy", name: "Mishary Rashid Alafasy", arabicName: "مشاري راشد العفاسي", audioSource: everyAyah("Alafasy_128kbps"), region: "gulf", style: "Murattal", quranComRecitationId: 7 },
  { id: "abdullah-basfar", name: "Abdullah Basfar", arabicName: "عبد الله بصفر", audioSource: everyAyah("Abdullah_Basfar_192kbps"), region: "gulf", style: "Murattal" },
  { id: "abdullah-matroud", name: "Abdullah Matroud", arabicName: "عبد الله مطرود", audioSource: everyAyah("Abdullah_Matroud_128kbps"), region: "gulf", style: "Murattal" },
  { id: "shaatree", name: "Abu Bakr Ash-Shaatree", arabicName: "أبو بكر الشاطري", audioSource: everyAyah("Abu_Bakr_Ash-Shaatree_128kbps"), region: "gulf", style: "Murattal", quranComRecitationId: 4 },
  { id: "ajmy", name: "Ahmed Al-Ajmi", arabicName: "أحمد العجمي", audioSource: everyAyah("ahmed_ibn_ali_al_ajamy_128kbps"), region: "gulf", style: "Murattal" },
  { id: "ahmad-nufais", name: "Ahmad Al-Nufais", arabicName: "أحمد النفيس", audioSource: mp3QuranChapter(259, "https://server16.mp3quran.net/nufais/Rewayat-Hafs-A-n-Assem/"), region: "gulf", style: "Murattal" },
  { id: "akram-alaqmi", name: "Akram Al-Alaqmi", arabicName: "أكرم العلاقمي", audioSource: everyAyah("Akram_AlAlaqimy_128kbps"), region: "gulf", style: "Murattal" },
  { id: "anas-emadi", name: "Anas Al-Emadi", arabicName: "أنس العمادي", audioSource: mp3QuranChapter(314, "https://server16.mp3quran.net/a_alemadi/Rewayat-Hafs-A-n-Assem/"), region: "gulf", style: "Murattal" },
  { id: "abdulaziz-turki", name: "Abdulaziz Al-Turki", arabicName: "عبد العزيز التركي", audioSource: mp3QuranChapter(282, "https://server16.mp3quran.net/a_turki/Rewayat-Hafs-A-n-Assem/"), region: "gulf", style: "Murattal" },
  { id: "fares-abbad", name: "Fares Abbad", arabicName: "فارس عباد", audioSource: everyAyah("Fares_Abbad_64kbps"), region: "gulf", style: "Murattal" },
  { id: "idrees-abkr", name: "Idrees Abkr", arabicName: "إدريس أبكر", audioSource: mp3QuranChapter(12, "https://server6.mp3quran.net/abkr/"), region: "gulf", style: "Murattal" },
  { id: "saad-ghamdi", name: "Saad Al-Ghamdi", arabicName: "سعد الغامدي", audioSource: everyAyah("Ghamadi_40kbps"), region: "gulf", style: "Murattal" },
  { id: "rifai", name: "Hani Ar-Rifai", arabicName: "هاني الرفاعي", audioSource: everyAyah("Hani_Rifai_192kbps"), region: "gulf", style: "Murattal", quranComRecitationId: 5 },
  { id: "khalid-qahtani", name: "Khalid Al-Qahtani", arabicName: "خالد القحطاني", audioSource: everyAyah("Khaalid_Abdullaah_al-Qahtaanee_192kbps"), region: "gulf", style: "Murattal" },
  { id: "khalid-jileel", name: "Khalid Al-Jileel", arabicName: "خالد الجليل", audioSource: mp3QuranChapter(20, "https://server10.mp3quran.net/jleel/"), region: "gulf", style: "Murattal" },
  { id: "muhammad-abdulkarim", name: "Muhammad Abdul Karim", arabicName: "محمد عبد الكريم", audioSource: everyAyah("Muhammad_AbdulKareem_128kbps"), region: "gulf", style: "Murattal" },
  { id: "nabil-rifai", name: "Nabil Ar-Rifai", arabicName: "نبيل الرفاعي", audioSource: everyAyah("Nabil_Rifa3i_48kbps"), region: "gulf", style: "Murattal" },
  { id: "nasser-qatami", name: "Nasser Al-Qatami", arabicName: "ناصر القطامي", audioSource: everyAyah("Nasser_Alqatami_128kbps"), region: "gulf", style: "Murattal" },
  { id: "sahl-yassin", name: "Sahl Yassin", arabicName: "سهل ياسين", audioSource: everyAyah("Sahl_Yassin_128kbps"), region: "gulf", style: "Murattal" },
  { id: "salah-bukhatir", name: "Salah Bukhatir", arabicName: "صلاح بو خاطر", audioSource: everyAyah("Salaah_AbdulRahman_Bukhatir_128kbps"), region: "gulf", style: "Murattal" },
  { id: "yasser-dossary", name: "Yasser Al-Dosari", arabicName: "ياسر الدوسري", audioSource: everyAyah("Yasser_Ad-Dussary_128kbps"), region: "gulf", style: "Murattal" },
  { id: "mansour-salimi", name: "Mansour Al-Salimi", arabicName: "منصور السالمي", audioSource: mp3QuranChapter(245, "https://server14.mp3quran.net/mansor/"), region: "gulf", style: "Murattal" },
  { id: "khalifa-tunaiji", name: "Khalifa Al-Tunaiji", arabicName: "خليفة الطنيجي", audioSource: everyAyah("khalefa_al_tunaiji_64kbps"), region: "gulf", style: "Murattal" },

  { id: "ayman-suwayd", name: "Ayman Suwayd", arabicName: "أيمن سويد", audioSource: everyAyah("Ayman_Sowaid_64kbps"), region: "levant", style: "Muallim" },
  { id: "yaser-salamah", name: "Yaser Salamah", arabicName: "ياسر سلامة", audioSource: everyAyah("Yaser_Salamah_128kbps"), region: "levant", style: "Murattal" },

  { id: "raad-kurdi", name: "Raad Al-Kurdi", arabicName: "رعد محمد الكردي", audioSource: mp3QuranChapter(221, "https://server6.mp3quran.net/kurdi/"), region: "international", style: "Murattal" },
  { id: "peshawa-qadr-kurdi", name: "Peshawa Qadr Al-Kurdi", arabicName: "بيشه وا قادر الكردي", audioSource: mp3QuranChapter(268, "https://server16.mp3quran.net/peshawa/Rewayat-Hafs-A-n-Assem/"), region: "international", style: "Murattal" },
  { id: "karim-mansouri", name: "Karim Mansouri", arabicName: "كريم منصوري", audioSource: everyAyah("Karim_Mansoori_40kbps"), region: "international", style: "Mujawwad" },
  { id: "parhizgar", name: "Shahriar Parhizgar", arabicName: "شهريار پرهيزكار", audioSource: everyAyah("Parhizgar_48kbps"), region: "international", style: "Murattal" },
  { id: "aziz-alili", name: "Aziz Alili", arabicName: "عزيز عليلي", audioSource: everyAyah("aziz_alili_128kbps"), region: "international", style: "Murattal" },
];

export function getReciter(id: string): Reciter | undefined {
  return reciters.find((reciter) => reciter.id === id);
}

export function getReciterOrDefault(id: string): Reciter {
  return getReciter(id) ?? reciters.find((reciter) => reciter.id === "alafasy")!;
}

export function supportsWordTimings(reciter: Reciter | undefined): boolean {
  return reciter?.quranComRecitationId != null;
}
