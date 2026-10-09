/** A named model input: float32 or int64 values with their shape. */
export interface Feed {
  data: Float32Array | BigInt64Array;
  dims: number[];
}
