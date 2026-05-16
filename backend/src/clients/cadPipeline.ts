import { env } from "../env";

export type CadFurnitureItem = {
  name: string;
  w: number;
  d: number;
  h: number;
};

export type CadRoom = {
  id: string;
  name: string;
  type: string;
  width: number;
  depth: number;
  area: number;
  windows: number;
  doors: number;
  furniture: CadFurnitureItem[];
  price_finishing: number;
  price_per_m2: number;
  crop_image_b64: string;
  canny_image_b64: string;
  generated_image_b64: string;
};

export type CadPipelineResult = {
  rooms: CadRoom[];
  pngBuffer: Buffer;
  mimeType: string;
  fileName: string;
  enhancedWithDiffusers: boolean;
};

export function isCadPipelineConfigured(): boolean {
  return !!env.cadPipeline.url;
}

export async function convertDxfViaCadPipeline(
  dxfBuffer: Buffer, // dxfBuffer is the buffer of the uploaded DXF file
  fileName: string, // fileName is the name of the uploaded file
  opts: {
    areaMq?: number; // areaMq is the area in square meters
    style?: string; // style is the style from the request body
    palette?: string; // palette is the palette from the request body
  } = {} // it means that the opts is an optional object with the default value of an empty object
): Promise<CadPipelineResult> {
  const baseUrl = env.cadPipeline.url.replace(/\/$/, ""); // baseUrl is the base URL of the CAD pipeline
  const timeoutMs = env.cadPipeline.timeoutMs; // timeoutMs is the timeout in milliseconds

  const form = new FormData(); // form is the form data for the request
  form.append( // append the dxf file to the form data
    "dxf_file", // dxf_file is the name of the uploaded file
    new Blob([dxfBuffer], { type: "application/octet-stream" }), // new Blob is the blob of the uploaded DXF file
    fileName // fileName is the name of the uploaded file
  );
  form.append("area_m2", String(opts.areaMq ?? 100)); // area_m2 is the area in square meters
  form.append("style", opts.style ?? "modern"); // style is the style from the request body
  form.append("palette", opts.palette ?? "neutral"); // palette is the palette from the request body

  const controller = new AbortController(); // controller is the abort controller for the request
  const timer = setTimeout(() => controller.abort(), timeoutMs); // timer is the timeout for the request

  let res: Response; // res is the response from the request
  try {
    res = await fetch(`${baseUrl}/process`, { // fetch the process from the CAD pipeline
      method: "POST", // method is the method of the request
      body: form, // body is the form data for the request
      signal: controller.signal, // signal is the signal for the request
    });
  } finally { 
    clearTimeout(timer); // clear the timeout for the request if the request finishes before the timeout or if an error occurs
  }

  if (!res.ok) { // if the response is not ok, throw an error
    const text = await res.text().catch(() => res.statusText); // text is the text of the response
    throw new Error(`CAD pipeline returned ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { rooms?: CadRoom[]; error?: string }; // data is the data from the response

  if (data.error) { // if the error is not empty, throw an error
    throw new Error(`CAD pipeline error: ${data.error}`);
  }

  const rooms: CadRoom[] = data.rooms ?? []; // rooms is the rooms from the response

  const firstCrop = rooms[0]?.crop_image_b64 ?? ""; // firstCrop is the first crop from the rooms
  const pngBuffer = firstCrop ? Buffer.from(firstCrop, "base64") : Buffer.alloc(0); // pngBuffer is the buffer of the first crop

  // return the result from the CAD pipeline
  return {  
    rooms, // rooms is the rooms from the response
    pngBuffer, // pngBuffer is the buffer of the first crop
    mimeType: "image/png", // mimeType is the mime type of the image
    fileName: fileName.replace(/\.dxf$/i, ".png"), // fileName is the name of the uploaded file without the extension
    enhancedWithDiffusers: rooms.length > 0, // enhancedWithDiffusers is true if the rooms are not empty
  };
}
