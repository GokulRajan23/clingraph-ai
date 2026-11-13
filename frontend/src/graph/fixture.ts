import type { Graph, GraphEdge, GraphNode } from './types'

/**
 * Synthetic patient history across five reports (2022–2024). Stand-in for the graph the
 * parsing pipeline will build; report nodes are renamed after the uploaded files.
 */

export const REPORT_IDS = ['r1', 'r2', 'r3', 'r4', 'r5'] as const

const nodes: GraphNode[] = [
  { id: 'patient', type: 'patient', label: 'PT-20871 · 64 y, female', props: [['Patient ID', 'PT-20871'], ['Born', '1960'], ['Reports', '5']] },

  { id: 'r1', type: 'report', label: 'CT thorax/abdomen · 10 Feb 2022', props: [['Kind', 'CT report'], ['Report date', '10 Feb 2022'], ['Department', 'Radiology']] },
  { id: 'r2', type: 'report', label: 'Discharge summary · 28 Mar 2022', props: [['Kind', 'Discharge summary'], ['Report date', '28 Mar 2022'], ['Department', 'Pulmonology']] },
  { id: 'r3', type: 'report', label: 'Follow-up CT · 17 Jan 2023', props: [['Kind', 'CT report'], ['Report date', '17 Jan 2023'], ['Department', 'Radiology']] },
  { id: 'r4', type: 'report', label: 'Procedure report · 21 Jun 2023', props: [['Kind', 'Procedure report'], ['Report date', '21 Jun 2023'], ['Department', 'Thoracic surgery']] },
  { id: 'r5', type: 'report', label: 'Follow-up CT · 14 May 2024', props: [['Kind', 'CT report'], ['Report date', '14 May 2024'], ['Department', 'Radiology']] },

  { id: 'nodule', type: 'finding', label: 'Pulmonary nodule, right upper lobe', props: [['Category', 'Finding'], ['Site', 'Right upper lobe'], ['Course', 'Progressed, then stable']] },
  { id: 'liver', type: 'finding', label: 'Liver lesion, segment VI', props: [['Category', 'Finding'], ['Site', 'Liver, segment VI'], ['Course', 'Improved, then not detectable']] },
  { id: 'lymph', type: 'finding', label: 'Mediastinal lymph node', props: [['Category', 'Finding'], ['Site', 'Station 4R'], ['Size', '11 mm short axis']] },
  { id: 'effusion', type: 'finding', label: 'Pleural effusion, left', props: [['Category', 'Complication'], ['Site', 'Left pleural space'], ['Course', 'Drained, then resolved']] },

  { id: 'nodule-1', type: 'observation', label: 'Nodule 14 mm', props: [['Change', 'First documented'], ['Size', '14 mm'], ['Date', '10 Feb 2022']] },
  { id: 'nodule-2', type: 'observation', label: 'Nodule 19 mm', props: [['Change', 'Progressed'], ['Size', '19 mm'], ['Date', '17 Jan 2023']] },
  { id: 'nodule-3', type: 'observation', label: 'Nodule 19 mm, unchanged', props: [['Change', 'Stable'], ['Size', '19 mm'], ['Date', '14 May 2024']] },
  { id: 'liver-1', type: 'observation', label: 'Liver lesion 15 mm', props: [['Change', 'First documented'], ['Size', '15 mm, hypodense'], ['Date', '10 Feb 2022']] },
  { id: 'liver-2', type: 'observation', label: 'Liver lesion 9 mm', props: [['Change', 'Improved'], ['Size', '9 mm'], ['Date', '17 Jan 2023']] },
  { id: 'liver-3', type: 'observation', label: 'Liver lesion not detectable', props: [['Change', 'Improved'], ['Size', 'Not detectable'], ['Date', '14 May 2024']] },

  { id: 'nsclc', type: 'diagnosis', label: 'Lung adenocarcinoma (NSCLC)', props: [['Status', 'Confirmed by histology'], ['ICD-10', 'C34.1'], ['Stage', 'cT1b N2 M1b']] },
  { id: 'mets', type: 'diagnosis', label: 'Liver metastasis', props: [['Status', 'Suspected, radiological'], ['ICD-10', 'C78.7']] },

  { id: 'biopsy', type: 'procedure', label: 'CT-guided lung biopsy', props: [['Date', '02 Mar 2022'], ['Result', 'Adenocarcinoma, PD-L1 60 %']] },
  { id: 'port', type: 'procedure', label: 'Port catheter implantation', props: [['Date', '09 Mar 2022'], ['Site', 'Right subclavian vein']] },
  { id: 'thoracentesis', type: 'procedure', label: 'Thoracentesis, left', props: [['Date', '21 Jun 2023'], ['Volume', '1,200 ml serous fluid']] },

  { id: 'carboplatin', type: 'medication', label: 'Carboplatin', props: [['Regimen', 'Carboplatin / pemetrexed'], ['Started', 'Mar 2022'], ['Stopped', 'Jan 2023']] },
  { id: 'pemetrexed', type: 'medication', label: 'Pemetrexed', props: [['Regimen', 'Carboplatin / pemetrexed'], ['Started', 'Mar 2022'], ['Stopped', 'Jan 2023']] },
  { id: 'pembrolizumab', type: 'medication', label: 'Pembrolizumab', props: [['Regimen', 'Monotherapy, 200 mg q3w'], ['Started', 'Jan 2023'], ['Status', 'Ongoing']] },
]

const e = (source: string, relation: string, target: string): GraphEdge => ({ source, target, relation })

const edges: GraphEdge[] = [
  ...REPORT_IDS.map((r) => e('patient', 'has_report', r)),
  e('patient', 'has_diagnosis', 'nsclc'),
  e('patient', 'has_diagnosis', 'mets'),

  e('nodule', 'has_observation', 'nodule-1'),
  e('nodule-1', 'progressed_to', 'nodule-2'),
  e('nodule-2', 'stable_as', 'nodule-3'),
  e('nodule-1', 'documented_in', 'r1'),
  e('nodule-2', 'documented_in', 'r3'),
  e('nodule-3', 'documented_in', 'r5'),

  e('liver', 'has_observation', 'liver-1'),
  e('liver-1', 'improved_to', 'liver-2'),
  e('liver-2', 'improved_to', 'liver-3'),
  e('liver-1', 'documented_in', 'r1'),
  e('liver-2', 'documented_in', 'r3'),
  e('liver-3', 'documented_in', 'r5'),

  e('lymph', 'documented_in', 'r1'),
  e('effusion', 'documented_in', 'r3'),
  e('effusion', 'documented_in', 'r4'),
  e('effusion', 'documented_in', 'r5'),

  e('nsclc', 'evidenced_by', 'nodule'),
  e('nsclc', 'evidenced_by', 'lymph'),
  e('nsclc', 'confirmed_by', 'biopsy'),
  e('nsclc', 'documented_in', 'r2'),
  e('mets', 'evidenced_by', 'liver'),
  e('mets', 'documented_in', 'r2'),

  e('biopsy', 'documented_in', 'r2'),
  e('port', 'documented_in', 'r2'),
  e('thoracentesis', 'treats', 'effusion'),
  e('thoracentesis', 'documented_in', 'r4'),

  e('nsclc', 'treated_with', 'carboplatin'),
  e('nsclc', 'treated_with', 'pemetrexed'),
  e('nsclc', 'treated_with', 'pembrolizumab'),
  e('carboplatin', 'documented_in', 'r2'),
  e('pemetrexed', 'documented_in', 'r2'),
  e('carboplatin', 'documented_in', 'r3'),
  e('pemetrexed', 'documented_in', 'r3'),
  e('pembrolizumab', 'documented_in', 'r3'),
  e('pembrolizumab', 'documented_in', 'r5'),
]

export const FIXTURE: Graph = { nodes, edges }
