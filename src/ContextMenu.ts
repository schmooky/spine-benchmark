import { Application, Container, Graphics, Text } from "pixi.js";

export class ContextMenu {
    app: any;
    menu: null | Container;
    subMenu: null | Container;
    isSubMenuOpen: boolean;
    menuOptions: ({ text: string; action: () => void; isSubmenu?: undefined; subOptions?: undefined; } | { text: string; isSubmenu: boolean; subOptions: { text: string; action: () => void; }[]; action?: undefined; })[];
    
    constructor(app: Application) {
        this.app = app;
        this.menu = null;
        this.subMenu = null;
        this.isSubMenuOpen = false;
        
        this.menuOptions = [
            { text: 'Option 1', action: () => console.log('Option 1 clicked') },
            { text: 'Option 2', action: () => console.log('Option 2 clicked') },
            { text: 'Option 3', action: () => console.log('Option 3 clicked') },
            { text: 'Option 4', action: () => console.log('Option 4 clicked') },
            { 
                text: 'Submenu', 
                isSubmenu: true,
                subOptions: [
                    { text: 'Sub Option 1', action: () => console.log('Sub Option 1 clicked') },
                    { text: 'Sub Option 2', action: () => console.log('Sub Option 2 clicked') },
                    { text: 'Sub Option 3', action: () => console.log('Sub Option 3 clicked') },
                    { text: 'Sub Option 4', action: () => console.log('Sub Option 4 clicked') },
                    { text: 'Sub Option 5', action: () => console.log('Sub Option 5 clicked') },
                ]
            },
        ];
        
        this.app.view.addEventListener('contextmenu', this.onContextMenu.bind(this));
        this.app.view.addEventListener('click', this.closeMenu.bind(this));
    }
    
    onContextMenu(event: MouseEvent) {
        event.preventDefault();
        this.closeMenu();
        this.createMenu(event.clientX, event.clientY);
    }
    
    createMenu(x:number, y:number) {
        this.menu = new Container();
        this.menu.x = x;
        this.menu.y = y;
        
        let yOffset = 0;
        const padding = 5;
        const itemHeight = 30;
        const menuWidth = 150;
        
        this.menuOptions.forEach((option, index) => {
            if(!this.menu) throw new Error('No Context Menu')
            const item = this.createMenuItem(option.text, menuWidth, itemHeight);
            item.y = yOffset;
            this.menu.addChild(item);
            
            item.eventMode = 'static';
            item.cursor = 'pointer';
            
            if (option.isSubmenu) {
                item.on('mouseover', () => this.openSubMenu(x + menuWidth, y + yOffset, option.subOptions));
                item.on('mouseout', () => {
                    if (!this.isSubMenuOpen) {
                        this.closeSubMenu();
                    }
                });
            } else {
                option.action && item.on('click', option.action);
                item.on('mouseover', () => this.closeSubMenu());
            }
            
            yOffset += itemHeight + padding;
        });
        
        this.app.stage.addChild(this.menu);
    }
    
    createMenuItem(text: string, width: number, height: number) {
        const item = new Graphics();
        item.beginFill(0xF0F0F0);
        item.drawRect(0, 0, width, height);
        item.endFill();
        
        const label = new Text(text, { fontSize: 14, fill: 0x000000 });
        label.x = 10;
        label.y = (height - label.height) / 2;
        item.addChild(label);
        
        return item;
    }
    
    openSubMenu(x: number, y: number, subOptions: any[]) {
        
        if(!this.subMenu) throw new Error('No Context SubMenu')
        this.closeSubMenu();
        this.subMenu = new Container();
        this.subMenu.x = x;
        this.subMenu.y = y;
        
        let yOffset = 0;
        const padding = 5;
        const itemHeight = 30;
        const menuWidth = 150;
        
        subOptions.forEach((option, index) => {
            
        if(!this.subMenu) throw new Error('No Context SubMenu')
            
            const item = this.createMenuItem(option.text, menuWidth, itemHeight);
            item.y = yOffset;
            this.subMenu.addChild(item);
            
            item.eventMode = 'static';
            item.cursor = 'pointer';
            item.on('click', option.action);
            
            yOffset += itemHeight + padding;
        });
        
        this.app.stage.addChild(this.subMenu);
        this.isSubMenuOpen = true;
    }
    
    closeSubMenu() {
        if (this.subMenu) {
            this.app.stage.removeChild(this.subMenu);
            this.subMenu = null;
            this.isSubMenuOpen = false;
        }
    }
    
    closeMenu() {
        if (this.menu) {
            this.app.stage.removeChild(this.menu);
            this.menu = null;
        }
        this.closeSubMenu();
    }
}
