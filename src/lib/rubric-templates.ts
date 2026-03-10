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
    key: 'affective_support',
    label: 'Affective Support',
    description:
      'Encourages and/or addresses the emotional needs of the learner.',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: {
        label: 'Not Present',
        description: 'Negative, discouraging, dismissive, or absent.',
      },
      2: {
        label: 'Unclear',
        description: 'Neutral or inconsistent encouragement.',
      },
      3: {
        label: 'Present',
        description: 'Supportive; acknowledges strengths and effort.',
      },
    },
  },
  {
    key: 'alignment',
    label: 'Alignment',
    description: 'Addresses the task at hand.',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: {
        label: 'Not Present',
        description: 'Irrelevant or misaligned to the task.',
      },
      2: {
        label: 'Unclear',
        description: 'Vague or partially misaligned to the task.',
      },
      3: {
        label: 'Present',
        description: 'Relevant, and aligned with task.',
      },
    },
  },
  {
    key: 'accuracy',
    label: 'Accuracy',
    description: 'The feedback is factually correct.',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: {
        label: 'Not Present',
        description: 'Incorrect or misleading.',
      },
      2: {
        label: 'Unclear',
        description: 'Some correct elements, but not all.',
      },
      3: {
        label: 'Present',
        description: 'Accurate / factually correct.',
      },
    },
  },
  {
    key: 'clarity',
    label: 'Clarity',
    description: 'It makes sense.',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: {
        label: 'Not Present',
        description: 'Confusing, ambiguous, or overly technical.',
      },
      2: {
        label: 'Unclear',
        description: 'Some clarity, but possible misunderstandings.',
      },
      3: {
        label: 'Present',
        description: 'Clear and accessible to the learner.',
      },
    },
  },
  {
    key: 'scaffolding',
    label: 'Scaffolding / Cognitive Load',
    description:
      'Provides step-by-step guidance that is of the appropriate grain size, logically chunked, and amount for the learner to respond to the task.',
    scaleMin: 1,
    scaleMax: 3,
    scoreLabels: {
      1: {
        label: 'Not Present',
        description:
          'Only evaluative ("right/wrong"); no guidance; too much guidance/reveals answers.',
      },
      2: {
        label: 'Unclear',
        description:
          'Vague or generic suggestions. Some useful info, but underdeveloped or cluttered.',
      },
      3: {
        label: 'Present',
        description:
          'Clear, specific steps to progress. Balanced; enough info without overload.',
      },
    },
  },
]
