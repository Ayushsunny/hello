import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Client } from '@gradio/client';

// Define types for the request payload
interface ImageProcessingPayload {
  uploadedImage: string;
  selection?: string;
  prompt: string;
  negativePrompt?: string;
  selectedModel?: string;
  steps?: number;
  cfg?: number;
  growSize?: number;
  sampler?: string;
  scheduler?: string;
  seed?: number;
  edgeStrength?: number;
  colorStrength?: number;
  inpaintStrength?: number;
}

// Define types for the API response
interface SuccessResponse {
  success: true;
  generatedImage: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  details?: any;
}

class MagicQuillProxyServer {
  private app: express.Application;
  private port: number;
  private gradioClient: Client | null = null;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT!, 10); // Railway will inject PORT dynamically
    this.initializeMiddleware();
    this.initializeRoutes();
  }  

  private initializeMiddleware(): void {
    // CORS configuration
    const corsOptions = {
      origin: '*', // Allow requests from any origin
      methods: ['POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };

    this.app.use(cors(corsOptions));
    this.app.use(express.json({ limit: '100mb' }));

    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error(err.stack);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
  }

  private initializeRoutes(): void {
    // Health check route
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        status: 'MagicQuill Proxy Server is running',
        timestamp: new Date().toISOString()
      });
    });

    // Image processing route
    this.app.post('/api/process-image', this.handleImageProcessing.bind(this));
  }

  private async getGradioClient(): Promise<Client> {
    if (!this.gradioClient) {
      try {
        this.gradioClient = await Client.connect("azhan77168/mq");
      } catch (error) {
        console.error('Failed to connect to Gradio client:', error);
        throw new Error('Could not establish connection to MagicQuill');
      }
    }
    return this.gradioClient;
  }

  private async handleImageProcessing(req: Request, res: Response): Promise<void> {
    try {
      const {
        uploadedImage,
        selection,
        prompt,
        negativePrompt = '',
        selectedModel = "SD1.5/realisticVisionV60B1_v51VAE.safetensors",
        steps = 20,
        cfg = 5.0,
        growSize = 15,
        sampler = "euler_ancestral",
        scheduler = "karras",
        seed = -1,
        edgeStrength = 0.55,
        colorStrength = 0.55,
        inpaintStrength = 1.0
      }: ImageProcessingPayload = req.body;

      // Validate required parameters
      if (!uploadedImage || !prompt) {
        res.status(400).json({
          success: false,
          error: "Missing required parameters",
          details: "Upload an image and provide a prompt"
        } as ErrorResponse);
        return;
      }

      const client = await this.getGradioClient();

      // Construct payload dynamically
      const payload = [
        {
          from_frontend: {
            add_color_image: uploadedImage,
            add_edge_image: uploadedImage,
            img: uploadedImage,
            original_image: uploadedImage,
            remove_edge_image: uploadedImage,
            total_mask: selection || uploadedImage,
          },
          from_backend: {
            prompt: prompt,
            generated_image: null,
          },
        },
        selectedModel,
        negativePrompt,
        "enable",
        growSize,
        edgeStrength,
        colorStrength,
        inpaintStrength,
        seed,
        steps,
        cfg,
        sampler,
        scheduler
      ];

      console.log("Payload sent to MagicQuill:", JSON.stringify(payload, null, 2));

      const result = await client.predict("/generate_image_handler", payload);

      console.log("Full response from MagicQuill:", JSON.stringify(result, null, 2));


      // Validate and process result
      if (result?.data && Array.isArray(result.data)) {
        const imageData = result.data[0]?.from_backend?.generated_image;
        console.log("Image data from MagicQuill:", imageData);
        if (typeof imageData === 'string') {
          res.json({
            success: true,
            generatedImage: `data:image/png;base64,${imageData}`
          });
        } else {
          throw new Error("Unexpected image format from MagicQuill");
        }

      } else {
        throw new Error("No valid image data returned from MagicQuill");
      }
    } catch (error) {
      console.error("Image processing error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown processing error",
        details: error
      } as ErrorResponse);
    }
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`🚀 Proxy server running on port ${this.port}`);
    });
  }  
}

// Instantiate and start the server
const server = new MagicQuillProxyServer();
server.start();

export default server;