export enum SpineErrorCode {
    FILE_READ_ERROR = 1001,
    IMAGE_LOAD_ERROR = 1002,
    JSON_PARSE_ERROR = 1003,
    UNSUPPORTED_VERSION = 1004,
    INVALID_SKELETON_STRUCTURE = 1005,
    BINARY_FILE_ERROR = 1006,
    ATLAS_READ_ERROR = 1007,
    INVALID_ATLAS_STRUCTURE = 1008,
    TEXTURE_NOT_FOUND = 1009,
    ATLAS_CREATE_ERROR = 1010,
    EMPTY_SKELETON = 1011,
    SKELETON_PARSE_ERROR = 1012,
    SPINE_INSTANCE_ERROR = 1013,
    CRITICAL_ASSET_ERROR = 1014,
    FILE_PROCESSING_ERROR = 1015,
    MISSING_SKELETON_FILE = 1016,
    MISSING_ATLAS_FILE = 1017,
  }
  
  interface SpineError {
    code: SpineErrorCode;
    message: string;
  }
  
  export class SpineErrorHandler extends Error {
    code: SpineErrorCode;
  
    constructor(error: SpineError) {
      super(error.message);
      this.code = error.code;
      this.name = "SpineError";
    }
  }
  
  export const SPINE_ERRORS: Record<SpineErrorCode, string> = {
    [SpineErrorCode.FILE_READ_ERROR]: "Ошибка чтения файла: {0}",
    [SpineErrorCode.IMAGE_LOAD_ERROR]: "Ошибка загрузки изображения {0}: {1}",
    [SpineErrorCode.JSON_PARSE_ERROR]:
      "Ошибка парсинга JSON файла скелета {0}: {1}",
    [SpineErrorCode.UNSUPPORTED_VERSION]:
      "Неподдерживаемая версия Spine: {0}. Максимальная поддерживаемая версия: 4.1",
    [SpineErrorCode.INVALID_SKELETON_STRUCTURE]:
      "Некорректная структура JSON файла скелета: {0}",
    [SpineErrorCode.BINARY_FILE_ERROR]:
      "Ошибка чтения бинарного файла скелета: {0}",
    [SpineErrorCode.ATLAS_READ_ERROR]: "Ошибка чтения файла атласа: {0}",
    [SpineErrorCode.INVALID_ATLAS_STRUCTURE]:
      "Некорректная структура файла атласа: {0}",
    [SpineErrorCode.TEXTURE_NOT_FOUND]: "Текстура не найдена: {0}",
    [SpineErrorCode.ATLAS_CREATE_ERROR]: "Ошибка создания атласа: {0}",
    [SpineErrorCode.EMPTY_SKELETON]: "Скелет не содержит костей",
    [SpineErrorCode.SKELETON_PARSE_ERROR]: "Ошибка парсинга скелета: {0}",
    [SpineErrorCode.SPINE_INSTANCE_ERROR]:
      "Ошибка создания экземпляра Spine: {0}",
    [SpineErrorCode.CRITICAL_ASSET_ERROR]:
      "Критическая ошибка при создании ассета: {0}",
    [SpineErrorCode.FILE_PROCESSING_ERROR]:
      "Произошла ошибка при обработке файла {0}: {1}",
    [SpineErrorCode.MISSING_SKELETON_FILE]:
      "Отсутствует файл скелета (.json или .skel). Загрузите файл скелета вместе с атласом.",
    [SpineErrorCode.MISSING_ATLAS_FILE]:
      "Отсутствует атлас файл (.atlas). Загрузите его вместе со скелетом.",
  };
  
  export function formatErrorMessage(
    code: SpineErrorCode,
    ...args: string[]
  ): string {
    let message = SPINE_ERRORS[code];
    args.forEach((arg, index) => {
      message = message.replace(`{${index}}`, arg);
    });
    return message;
  }