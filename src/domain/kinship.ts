export type CanonicalRelationKey =
  | 'same_person'
  | 'spouse_partner'
  | 'husband'
  | 'wife'
  | 'father'
  | 'mother'
  | 'parent'
  | 'son'
  | 'daughter'
  | 'child'
  | 'brother'
  | 'sister'
  | 'sibling'
  | 'grandfather'
  | 'grandmother'
  | 'grandparent'
  | 'grandson'
  | 'granddaughter'
  | 'grandchild'
  | 'maternal_uncle'
  | 'maternal_aunt'
  | 'maternal_aunt_uncle'
  | 'maternal_uncle_spouse'
  | 'maternal_aunt_spouse'
  | 'maternal_in_law'
  | 'paternal_uncle'
  | 'paternal_aunt'
  | 'paternal_aunt_uncle'
  | 'paternal_uncle_spouse'
  | 'paternal_aunt_spouse'
  | 'paternal_in_law'
  | 'cousin'

export type KinshipLabelSet = {
  en: string
  ta: string
  taLatin: string
  hi: string
  hiLatin: string
}

export const KINSHIP_LABELS: Record<CanonicalRelationKey, KinshipLabelSet> = {
  same_person: {
    en: 'same person',
    ta: 'அதே நபர்',
    taLatin: 'atē napar',
    hi: 'वही व्यक्ति',
    hiLatin: 'vahī vyakti',
  },
  spouse_partner: {
    en: 'spouse / partner',
    ta: 'துணைவர்',
    taLatin: 'tuṇaivar',
    hi: 'जीवनसाथी',
    hiLatin: 'jīvanasāthī',
  },
  husband: {
    en: 'husband',
    ta: 'கணவர்',
    taLatin: 'kaṇavar',
    hi: 'पति',
    hiLatin: 'pati',
  },
  wife: {
    en: 'wife',
    ta: 'மனைவி',
    taLatin: 'maṉaivi',
    hi: 'पत्नी',
    hiLatin: 'patnī',
  },
  father: {
    en: 'father',
    ta: 'அப்பா',
    taLatin: 'appā',
    hi: 'पिता',
    hiLatin: 'pitā',
  },
  mother: {
    en: 'mother',
    ta: 'அம்மா',
    taLatin: 'ammā',
    hi: 'माता',
    hiLatin: 'mātā',
  },
  parent: {
    en: 'parent',
    ta: 'பெற்றோர்',
    taLatin: 'peṟṟōr',
    hi: 'माता / पिता',
    hiLatin: 'mātā / pitā',
  },
  son: {
    en: 'son',
    ta: 'மகன்',
    taLatin: 'magaṉ',
    hi: 'बेटा',
    hiLatin: 'beṭā',
  },
  daughter: {
    en: 'daughter',
    ta: 'மகள்',
    taLatin: 'magaḷ',
    hi: 'बेटी',
    hiLatin: 'beṭī',
  },
  child: {
    en: 'child',
    ta: 'குழந்தை',
    taLatin: 'kuḻantai',
    hi: 'संतान',
    hiLatin: 'santān',
  },
  brother: {
    en: 'brother',
    ta: 'சகோதரன்',
    taLatin: 'cakōtaran',
    hi: 'भाई',
    hiLatin: 'bhāī',
  },
  sister: {
    en: 'sister',
    ta: 'சகோதரி',
    taLatin: 'cakōtari',
    hi: 'बहन',
    hiLatin: 'bahan',
  },
  sibling: {
    en: 'sibling',
    ta: 'உடன்பிறப்பு',
    taLatin: 'uṭaṉpiṟappu',
    hi: 'सहोदर',
    hiLatin: 'sahōdar',
  },
  grandfather: {
    en: 'grandfather',
    ta: 'தாத்தா',
    taLatin: 'tāttā',
    hi: 'दादा / नाना',
    hiLatin: 'dādā / nānā',
  },
  grandmother: {
    en: 'grandmother',
    ta: 'பாட்டி',
    taLatin: 'pāṭṭi',
    hi: 'दादी / नानी',
    hiLatin: 'dādī / nānī',
  },
  grandparent: {
    en: 'grandparent',
    ta: 'தாத்தா / பாட்டி',
    taLatin: 'tāttā / pāṭṭi',
    hi: 'दादा-दादी / नाना-नानी',
    hiLatin: 'dādā-dādī / nānā-nānī',
  },
  grandson: {
    en: 'grandson',
    ta: 'பேரன்',
    taLatin: 'pēraṉ',
    hi: 'पोता / नाती',
    hiLatin: 'pōtā / nātī',
  },
  granddaughter: {
    en: 'granddaughter',
    ta: 'பேத்தி',
    taLatin: 'pētti',
    hi: 'पोती / नातिन',
    hiLatin: 'pōtī / nātin',
  },
  grandchild: {
    en: 'grandchild',
    ta: 'பேரப்பிள்ளை',
    taLatin: 'pērap piḷḷai',
    hi: 'पोता / पोती / नाती / नातिन',
    hiLatin: 'pōtā / pōtī / nātī / nātin',
  },
  maternal_uncle: {
    en: 'maternal uncle',
    ta: 'மாமா',
    taLatin: 'māmā',
    hi: 'मामा',
    hiLatin: 'māmā',
  },
  maternal_aunt: {
    en: 'maternal aunt',
    ta: 'சித்தி / பெரியம்மா',
    taLatin: 'citti / periyammā',
    hi: 'मौसी',
    hiLatin: 'mausī',
  },
  maternal_aunt_uncle: {
    en: 'maternal aunt / uncle',
    ta: 'மாமா / சித்தி / பெரியம்மா',
    taLatin: 'māmā / citti / periyammā',
    hi: 'मामा / मौसी',
    hiLatin: 'māmā / mausī',
  },
  maternal_uncle_spouse: {
    en: 'maternal uncle’s spouse',
    ta: 'மாமி',
    taLatin: 'māmi',
    hi: 'मामी',
    hiLatin: 'māmī',
  },
  maternal_aunt_spouse: {
    en: 'maternal aunt’s spouse',
    ta: 'சித்தப்பா / பெரியப்பா',
    taLatin: 'cittappā / periyappā',
    hi: 'मौसा',
    hiLatin: 'mausā',
  },
  maternal_in_law: {
    en: 'maternal relative by marriage',
    ta: 'மாமி / சித்தப்பா / பெரியப்பா',
    taLatin: 'māmi / cittappā / periyappā',
    hi: 'मामी / मौसा',
    hiLatin: 'māmī / mausā',
  },
  paternal_uncle: {
    en: 'paternal uncle',
    ta: 'சித்தப்பா / பெரியப்பா',
    taLatin: 'cittappā / periyappā',
    hi: 'चाचा / ताऊ',
    hiLatin: 'cācā / tāū',
  },
  paternal_aunt: {
    en: 'paternal aunt',
    ta: 'அத்தை',
    taLatin: 'attai',
    hi: 'बुआ',
    hiLatin: 'buā',
  },
  paternal_aunt_uncle: {
    en: 'paternal aunt / uncle',
    ta: 'அத்தை / சித்தப்பா / பெரியப்பா',
    taLatin: 'attai / cittappā / periyappā',
    hi: 'बुआ / चाचा / ताऊ',
    hiLatin: 'buā / cācā / tāū',
  },
  paternal_uncle_spouse: {
    en: 'paternal uncle’s spouse',
    ta: 'சித்தி / பெரியம்மா',
    taLatin: 'citti / periyammā',
    hi: 'चाची / ताई',
    hiLatin: 'cācī / tāī',
  },
  paternal_aunt_spouse: {
    en: 'paternal aunt’s spouse',
    ta: 'அத்திம்பேர்',
    taLatin: 'attimpēr',
    hi: 'फूफा',
    hiLatin: 'phūphā',
  },
  paternal_in_law: {
    en: 'paternal relative by marriage',
    ta: 'அத்திம்பேர் / சித்தி / பெரியம்மா',
    taLatin: 'attimpēr / citti / periyammā',
    hi: 'फूफा / चाची / ताई',
    hiLatin: 'phūphā / cācī / tāī',
  },
  cousin: {
    en: 'cousin',
    ta: 'உறவுச் சகோதரர் / சகோதரி',
    taLatin: 'uṟavuc cakōtarar / cakōtari',
    hi: 'कज़िन',
    hiLatin: 'kazin',
  },
}

export function labelsForRelation(key: CanonicalRelationKey): KinshipLabelSet {
  return KINSHIP_LABELS[key]
}
