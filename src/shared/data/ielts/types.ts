export type IeltsLevel = "B1" | "B2" | "C1";

/** [word, part of speech, level, Chinese, English definition, example sentence] */
export type IeltsWord = readonly [
  word: string,
  pos: string,
  level: IeltsLevel,
  zh: string,
  definition: string,
  example: string,
];
