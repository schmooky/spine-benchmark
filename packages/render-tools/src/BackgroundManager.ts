import { Application, Sprite, Texture, Container, Assets } from 'pixi.js';

export class BackgroundManager {
  private app: Application;
  private bgSprite: Sprite | null = null;
  private container: Container;
  private textureId: string | null = null;

  constructor(app: Application) {
    this.app = app;
    
    // Create a container that will be positioned at the bottom of the render stack
    this.container = new Container();
    
    // Add the container to the stage
    // Insert at index 0 to ensure it's behind everything else
    if (this.app.stage.children.length > 0) {
      this.app.stage.addChildAt(this.container, 0);
    } else {
      this.app.stage.addChild(this.container);
    }
    
    // Listen for resize events to update the background size
    window.addEventListener('resize', this.resizeBackground.bind(this));
  }

  /**
   * Sets a background image from a base64 string
   * @param base64Data The base64 encoded image data
   */
  public async setBackgroundImage(base64Data: string): Promise<void> {
    try {
      // Clean up old image if exists
      this.clearBackground();
      
      // Generate a unique ID for this texture
      this.textureId = `bg_${Date.now()}`;
      
      // Add the base64 image to the Assets cache
      await Assets.add({alias: this.textureId, src: base64Data});
      
      // Load the texture
      const texture = await Assets.load(this.textureId);
      
      // Create a sprite with the texture
      this.bgSprite = new Sprite(texture);
      
      // Add the sprite to the container
      this.container.addChild(this.bgSprite);
      
      // Adjust the size
      this.resizeBackground();
    } catch (error) {
      console.error('Error loading background image:', error);
      throw error;
    }
  }

  /**
   * Resizes the background to fit within the canvas
   */
  private resizeBackground(): void {
    if (!this.bgSprite) return;
    
    const renderer = this.app.renderer;
    const stageWidth = renderer.width;
    const stageHeight = renderer.height;
    
    // Calculate scale to fit the image inside the screen (contain)
    const imageRatio = this.bgSprite.texture.width / this.bgSprite.texture.height;
    const screenRatio = stageWidth / stageHeight;
    
    if (imageRatio > screenRatio) {
      // Image is wider than screen ratio - fit width
      this.bgSprite.width = stageWidth;
      this.bgSprite.height = stageWidth / imageRatio;
    } else {
      // Image is taller than screen ratio - fit height
      this.bgSprite.height = stageHeight;
      this.bgSprite.width = stageHeight * imageRatio;
    }
    
    // Center the background
    this.bgSprite.x = (stageWidth - this.bgSprite.width) / 2;
    this.bgSprite.y = (stageHeight - this.bgSprite.height) / 2;
  }

  /**
   * Clears the current background image
   */
  public clearBackground(): void {
    if (this.bgSprite) {
      this.container.removeChild(this.bgSprite);
      this.bgSprite.destroy({ texture: true });
      this.bgSprite = null;
    }
    
    // Unload the texture from Assets cache if it exists
    if (this.textureId) {
      Assets.unload(this.textureId);
      this.textureId = null;
    }
  }

  /**
   * Cleans up resources
   */
  public destroy(): void {
    this.clearBackground();
    window.removeEventListener('resize', this.resizeBackground.bind(this));
    this.app.stage.removeChild(this.container);
    this.container.destroy();
  }
}