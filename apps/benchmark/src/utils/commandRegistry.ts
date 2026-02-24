export interface Command {
  id: string;
  title: string;
  category: 'recently-used' | 'debug' | 'animation' | 'skin' | 'performance' | 'language' | 'file';
  description?: string;
  icon?: string;
  execute: () => void | Promise<void>;
  keywords?: string[];
}

export interface CommandCategory {
  id: string;
  title: string;
  commands: Command[];
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private recentCommands: string[] = [];
  private maxRecentCommands = 10;

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  unregister(commandId: string): void {
    this.commands.delete(commandId);
  }

  getCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommandsByCategory(category: Command['category']): Command[] {
    return Array.from(this.commands.values()).filter(cmd => cmd.category === category);
  }

  getRecentCommands(): Command[] {
    return this.recentCommands
      .map(id => this.commands.get(id))
      .filter((cmd): cmd is Command => cmd !== undefined);
  }

  executeCommand(commandId: string): void {
    const command = this.commands.get(commandId);
    if (command) {
      // Add to recent commands
      this.addToRecent(commandId);
      
      // Execute the command
      try {
        command.execute();
      } catch (error) {
        console.error('Command execution failed:', error);
      }
    }
  }

  private addToRecent(commandId: string): void {
    // Remove if already exists
    const existingIndex = this.recentCommands.indexOf(commandId);
    if (existingIndex !== -1) {
      this.recentCommands.splice(existingIndex, 1);
    }

    // Add to beginning
    this.recentCommands.unshift(commandId);

    // Limit size
    if (this.recentCommands.length > this.maxRecentCommands) {
      this.recentCommands = this.recentCommands.slice(0, this.maxRecentCommands);
    }

    // Persist to localStorage
    this.saveRecentCommands();
  }

  private saveRecentCommands(): void {
    try {
      localStorage.setItem('spine-benchmark-recent-commands', JSON.stringify(this.recentCommands));
    } catch (error) {
      console.warn('Failed to save recent commands to localStorage:', error);
    }
  }

  loadRecentCommands(): void {
    try {
      const saved = localStorage.getItem('spine-benchmark-recent-commands');
      if (saved) {
        this.recentCommands = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load recent commands from localStorage:', error);
      this.recentCommands = [];
    }
  }

  search(query: string): Command[] {
    if (!query.trim()) {
      return this.getAllCommands();
    }

    const lowerQuery = query.toLowerCase();
    return Array.from(this.commands.values()).filter(command => {
      const titleMatch = command.title.toLowerCase().includes(lowerQuery);
      const descriptionMatch = command.description?.toLowerCase().includes(lowerQuery) || false;
      const keywordMatch = command.keywords?.some(keyword => 
        keyword.toLowerCase().includes(lowerQuery)
      ) || false;

      return titleMatch || descriptionMatch || keywordMatch;
    });
  }

  getGroupedCommands(query?: string, t?: (key: string) => string): CommandCategory[] {
    const commands = query ? this.search(query) : this.getAllCommands();
    const recentCommands = this.getRecentCommands();

    const categories: CommandCategory[] = [
      {
        id: 'recently-used',
        title: t ? t('commands.categories.recentlyUsed') : 'Recently Used',
        commands: query ? recentCommands.filter(cmd =>
          cmd.title.toLowerCase().includes(query.toLowerCase())
        ) : recentCommands
      },
      {
        id: 'file',
        title: t ? t('commands.categories.file') : 'File Commands',
        commands: commands.filter(cmd => cmd.category === 'file')
      },
      {
        id: 'debug',
        title: t ? t('commands.categories.debug') : 'Debug Commands',
        commands: commands.filter(cmd => cmd.category === 'debug')
      },
      {
        id: 'animation',
        title: t ? t('commands.categories.animation') : 'Animation Commands',
        commands: commands.filter(cmd => cmd.category === 'animation')
      },
      {
        id: 'skin',
        title: t ? t('commands.categories.skin') : 'Skin Commands',
        commands: commands.filter(cmd => cmd.category === 'skin')
      },
      {
        id: 'performance',
        title: t ? t('commands.categories.performance') : 'Performance Commands',
        commands: commands.filter(cmd => cmd.category === 'performance')
      },
      {
        id: 'language',
        title: t ? t('commands.categories.language') : 'Language Commands',
        commands: commands.filter(cmd => cmd.category === 'language')
      }
    ];

    // Filter out empty categories
    return categories.filter(category => category.commands.length > 0);
  }
}

export const commandRegistry = new CommandRegistry();