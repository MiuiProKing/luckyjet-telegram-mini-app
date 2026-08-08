#import "ScreenCaptureManager.h"
#import "CaptureStore.h"
#import <Vision/Vision.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>

NSString * const APCaptureStatusNotification = @"APCaptureStatusNotification";

@interface ScreenCaptureManager ()
@property (nonatomic) BOOL capturing;
@property (nonatomic, copy) NSString *statusText;
@property (nonatomic, strong) id picker;
@property (nonatomic, strong) id stream;
@property (nonatomic) dispatch_queue_t sampleQueue;
@property (nonatomic) CFTimeInterval lastOCRTime;
@property (nonatomic) void *sckHandle;
@end

@implementation ScreenCaptureManager

+ (instancetype)shared {
    static ScreenCaptureManager *s;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ s = [ScreenCaptureManager new]; });
    return s;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _statusText = @"Готов к запуску";
        _sampleQueue = dispatch_queue_create("com.miuiproking.apcollector.samples", DISPATCH_QUEUE_SERIAL);
        _lastOCRTime = 0;
    }
    return self;
}

- (void)setStatus:(NSString *)status {
    self.statusText = status ?: @"";
    dispatch_async(dispatch_get_main_queue(), ^{
        [[NSNotificationCenter defaultCenter] postNotificationName:APCaptureStatusNotification object:nil];
    });
}

- (BOOL)prepareScreenCaptureKit {
    if (@available(iOS 27.0, *)) {
        if (!self.sckHandle) {
            self.sckHandle = dlopen("/System/Library/Frameworks/ScreenCaptureKit.framework/ScreenCaptureKit", RTLD_NOW | RTLD_LOCAL);
        }
        if (!self.sckHandle) return NO;

        Class cls = [self class];
        Protocol *p1 = NSProtocolFromString(@"SCContentSharingPickerObserver");
        Protocol *p2 = NSProtocolFromString(@"SCStreamOutput");
        Protocol *p3 = NSProtocolFromString(@"SCStreamDelegate");
        if (p1) class_addProtocol(cls, p1);
        if (p2) class_addProtocol(cls, p2);
        if (p3) class_addProtocol(cls, p3);
        return YES;
    }
    return NO;
}

- (void)presentSystemPicker {
    if (![self prepareScreenCaptureKit]) {
        [self setStatus:@"Для полного захвата экрана нужен iOS 27 или новее."];
        return;
    }

    Class PickerClass = NSClassFromString(@"SCContentSharingPicker");
    if (!PickerClass) {
        [self setStatus:@"ScreenCaptureKit недоступен на этом устройстве."];
        return;
    }

    id picker = ((id (*)(id, SEL))objc_msgSend)((id)PickerClass, NSSelectorFromString(@"sharedPicker"));
    if (!picker) {
        [self setStatus:@"Не удалось открыть системный выбор экрана."];
        return;
    }
    self.picker = picker;

    SEL addSel = NSSelectorFromString(@"addObserver:");
    if ([picker respondsToSelector:addSel]) ((void (*)(id, SEL, id))objc_msgSend)(picker, addSel, self);

    SEL activeSel = NSSelectorFromString(@"setActive:");
    if ([picker respondsToSelector:activeSel]) ((void (*)(id, SEL, BOOL))objc_msgSend)(picker, activeSel, YES);

    SEL presentSel = NSSelectorFromString(@"present");
    if ([picker respondsToSelector:presentSel]) {
        [self setStatus:@"Выберите «Весь экран», затем откройте AllPredictor."];
        ((void (*)(id, SEL))objc_msgSend)(picker, presentSel);
    } else {
        [self setStatus:@"Системный выбор экрана недоступен."];
    }
}

- (void)stopCapture {
    id stream = self.stream;
    self.stream = nil;
    self.capturing = NO;
    if (stream) {
        SEL stopSel = NSSelectorFromString(@"stopCaptureWithCompletionHandler:");
        if ([stream respondsToSelector:stopSel]) {
            void (^completion)(NSError *) = ^(NSError *error) {
                [self setStatus:error ? [NSString stringWithFormat:@"Остановлено: %@", error.localizedDescription] : @"Сбор остановлен. Данные сохранены."];
            };
            ((void (*)(id, SEL, id))objc_msgSend)(stream, stopSel, completion);
        }
    }
    if (self.picker) {
        SEL removeSel = NSSelectorFromString(@"removeObserver:");
        if ([self.picker respondsToSelector:removeSel]) ((void (*)(id, SEL, id))objc_msgSend)(self.picker, removeSel, self);
        SEL activeSel = NSSelectorFromString(@"setActive:");
        if ([self.picker respondsToSelector:activeSel]) ((void (*)(id, SEL, BOOL))objc_msgSend)(self.picker, activeSel, NO);
    }
    [self setStatus:@"Сбор остановлен. Данные сохранены."];
}

#pragma mark - Dynamic ScreenCaptureKit callbacks

- (void)contentSharingPicker:(id)picker didUpdateWithFilter:(id)filter forStream:(id)existingStream {
    if (!filter) return;
    [self startStreamWithFilter:filter existingStream:existingStream];
}

- (void)contentSharingPicker:(id)picker didCancelForStream:(id)stream {
    [self setStatus:@"Выбор экрана отменён."];
}

- (void)contentSharingPickerStartDidFailWithError:(NSError *)error {
    [self setStatus:[NSString stringWithFormat:@"Ошибка выбора экрана: %@", error.localizedDescription ?: @"неизвестная ошибка"]];
}

- (void)startStreamWithFilter:(id)filter existingStream:(id)existingStream {
    if (existingStream) {
        SEL updateSel = NSSelectorFromString(@"updateContentFilter:completionHandler:");
        if ([existingStream respondsToSelector:updateSel]) {
            ((void (*)(id, SEL, id, id))objc_msgSend)(existingStream, updateSel, filter, nil);
        }
        self.stream = existingStream;
        self.capturing = YES;
        [self setStatus:@"Сбор активен. Перейдите в AllPredictor."];
        return;
    }

    Class ConfigClass = NSClassFromString(@"SCStreamConfiguration");
    Class StreamClass = NSClassFromString(@"SCStream");
    if (!ConfigClass || !StreamClass) {
        [self setStatus:@"Не удалось создать поток захвата."];
        return;
    }

    id config = ((id (*)(id, SEL))objc_msgSend)((id)ConfigClass, sel_registerName("alloc"));
    config = ((id (*)(id, SEL))objc_msgSend)(config, sel_registerName("init"));

    id stream = ((id (*)(id, SEL))objc_msgSend)((id)StreamClass, sel_registerName("alloc"));
    stream = ((id (*)(id, SEL, id, id, id))objc_msgSend)(stream, NSSelectorFromString(@"initWithFilter:configuration:delegate:"), filter, config, self);
    if (!stream) {
        [self setStatus:@"Не удалось инициализировать захват экрана."];
        return;
    }

    NSError *error = nil;
    BOOL ok = ((BOOL (*)(id, SEL, id, NSInteger, dispatch_queue_t, NSError **))objc_msgSend)(stream, NSSelectorFromString(@"addStreamOutput:type:sampleHandlerQueue:error:"), self, 0, self.sampleQueue, &error);
    if (!ok || error) {
        [self setStatus:[NSString stringWithFormat:@"Ошибка видеопотока: %@", error.localizedDescription ?: @"неизвестная ошибка"]];
        return;
    }

    self.stream = stream;
    self.capturing = YES;
    void (^completion)(NSError *) = ^(NSError *startError) {
        if (startError) {
            self.capturing = NO;
            [self setStatus:[NSString stringWithFormat:@"Ошибка запуска: %@", startError.localizedDescription]];
        } else {
            [self setStatus:@"Сбор активен. Откройте AllPredictor — видимые коэффициенты и URL сохраняются автоматически."];
        }
    };
    ((void (*)(id, SEL, id))objc_msgSend)(stream, NSSelectorFromString(@"startCaptureWithCompletionHandler:"), completion);
}

- (void)stream:(id)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(NSInteger)type {
    if (type != 0 || !sampleBuffer) return;
    CFTimeInterval now = CACurrentMediaTime();
    if (now - self.lastOCRTime < 0.8) return;
    self.lastOCRTime = now;

    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!imageBuffer) return;
    [self runOCR:imageBuffer];
}

- (void)stream:(id)stream didStopWithError:(NSError *)error {
    self.capturing = NO;
    [self setStatus:[NSString stringWithFormat:@"Захват остановлен: %@", error.localizedDescription ?: @"системой"]];
}

- (void)streamDidBecomeInactive:(id)stream {
    self.capturing = NO;
    [self setStatus:@"Захват экрана стал неактивен."];
}

#pragma mark - OCR

- (void)runOCR:(CVPixelBufferRef)pixelBuffer {
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:^(VNRequest * _Nonnull req, NSError * _Nullable error) {
        if (error) return;
        NSMutableArray<NSString *> *lines = [NSMutableArray array];
        for (VNRecognizedTextObservation *obs in req.results) {
            VNRecognizedText *top = [[obs topCandidates:1] firstObject];
            if (top.string.length) [lines addObject:top.string];
        }
        [self processRecognizedLines:lines];
    }];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = NO;
    request.recognitionLanguages = @[@"en-US", @"ru-RU", @"fr-FR"];

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCVPixelBuffer:pixelBuffer options:@{}];
    [handler performRequests:@[request] error:nil];
}

- (void)processRecognizedLines:(NSArray<NSString *> *)lines {
    if (lines.count == 0) return;
    NSRegularExpression *coef = [NSRegularExpression regularExpressionWithPattern:@"(?<![0-9])(?:[1-9][0-9]{0,2})(?:[\\.,][0-9]{1,3})?\\s*[xX×](?![A-Za-z])" options:0 error:nil];
    NSRegularExpression *url = [NSRegularExpression regularExpressionWithPattern:@"https?://[^\\s\\]\\)>,]+" options:NSRegularExpressionCaseInsensitive error:nil];
    NSArray<NSString *> *keywords = @[@"lucky", @"jet", @"rocket", @"queen", @"predict", @"коэф", @"coefficient", @"round", @"раунд", @"multiplier"];

    for (NSString *line in lines) {
        NSString *trim = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (trim.length == 0) continue;
        NSRange full = NSMakeRange(0, trim.length);

        for (NSTextCheckingResult *m in [coef matchesInString:trim options:0 range:full]) {
            NSString *value = [trim substringWithRange:m.range];
            value = [[value stringByReplacingOccurrencesOfString:@"," withString:@"."] stringByReplacingOccurrencesOfString:@"×" withString:@"x"];
            value = [value stringByReplacingOccurrencesOfString:@" " withString:@""];
            [[CaptureStore shared] addKind:@"coefficient" value:value context:trim];
        }
        for (NSTextCheckingResult *m in [url matchesInString:trim options:0 range:full]) {
            NSString *value = [trim substringWithRange:m.range];
            [[CaptureStore shared] addKind:@"url" value:value context:trim];
        }

        NSString *lower = trim.lowercaseString;
        BOOL relevant = NO;
        for (NSString *kw in keywords) {
            if ([lower containsString:kw]) { relevant = YES; break; }
        }
        if (relevant && trim.length <= 180) {
            [[CaptureStore shared] addKind:@"text" value:trim context:trim];
        }
    }
}

@end
