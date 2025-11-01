import { Application, Sprite, Texture, Container, Assets } from 'pixi.js';

export class BackgroundManager {
  private app: Application;
  private bgSprite: Sprite | null = null;
  private container: Container;
  private textureId: string | null = null;

  constructor(app: Application) {
    this.app = app;
    
    this.container = new Container();
    
    if (this.app.stage.children.length > 0) {
      this.app.stage.addChildAt(this.container, 0);
    } else {
      this.app.stage.addChild(this.container);
    }
    
    window.addEventListener('resize', this.resizeBackground.bind(this));
  }

  /**
   * Sets a background image from a base64 string
   * @param base64Data The base64 encoded image data
   */
  public async setBackgroundImage(base64Data: string): Promise<void> {
    try {
      this.clearBackground();
      
      this.textureId = `bg_${Date.now()}`;
      
      await Assets.add({alias: this.textureId, src: base64Data});
      
      const texture = await Assets.load(this.textureId);
      
      this.bgSprite = new Sprite(texture);
      
      this.container.addChild(this.bgSprite);
      
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
    
    const imageRatio = this.bgSprite.texture.width / this.bgSprite.texture.height;
    const screenRatio = stageWidth / stageHeight;
    
    if (imageRatio > screenRatio) {
      this.bgSprite.width = stageWidth;
      this.bgSprite.height = stageWidth / imageRatio;
    } else {
      this.bgSprite.height = stageHeight;
      this.bgSprite.width = stageHeight * imageRatio;
    }
    
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