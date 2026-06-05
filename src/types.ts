export type CharInfo = {
  char: string;
  time: number;
};

export type Segment = {
  id: string;
  startTime: number;
  endTime: number;
  originalChars: CharInfo[];
  editedText: string;
};
