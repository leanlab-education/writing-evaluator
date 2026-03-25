// Default rubric template — adapted from Zach's Quill evaluation rubric
// Used as the starting point when creating new projects

export interface RubricDimensionTemplate {
  key: string
  label: string
  description: string
  scaleMin: number
  scaleMax: number
  scoreLabels: Record<number, { label: string; description: string }>
}

export const DEFAULT_RUBRIC: RubricDimensionTemplate[] = [
  {
    key: 'criterion_1',
    label: 'Criterion 1',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_2',
    label: 'Criterion 2',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_3',
    label: 'Criterion 3',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_4',
    label: 'Criterion 4',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_5',
    label: 'Criterion 5',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_6',
    label: 'Criterion 6',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_7',
    label: 'Criterion 7',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
  {
    key: 'criterion_8',
    label: 'Criterion 8',
    description: '',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear', description: '' },
      3: { label: 'Present', description: '' },
    },
  },
]
