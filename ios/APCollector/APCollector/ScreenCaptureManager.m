#import "ScreenCaptureManager.h"
#import "CaptureStore.h"
#import <Vision/Vision.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <CoreImage/CoreImage.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>
#import <math.h>

NSString * const APCaptureStatusNotification = @"APCaptureStatusNotification";

@interface ScreenCaptureManager ()
@property (nonatomic) BOOL capturing;
@property (nonatomic, copy) NSString *statusText;
@property (nonatomic, strong) id picker;
@property (nonatomic, strong) id stream;
@property (nonatomic) dispatch_queue_t sampleQueue;
@property (nonatomic) CFTimeInterval lastOCRTime;
@property (nonatomic) CFTimeInterval lastFrameTime;
@property (nonatomic) void *sckHandle;
@property (nonatomic, strong) CIContext *ciContext;

@property (nonatomic, strong) NSMutableArray<NSData *> *recentFrameJPEGs;
@property (nonatomic, strong) NSMutableArray<NSDate *> *recentFrameDates;

@property (nonatomic, copy) NSString *lastTarget;
@property (nonatomic) BOOL paywallSnapshotSaved;

@property (nonatomic, strong) NSMutableArray<NSData *> *transitionFrameJPEGs;
@property (nonatomic, strong) NSMutableArray<NSDate *> *transitionFrameDates;
@property (nonatomic, copy) NSString *transitionTarget;
@property (nonatomic, copy) NSString *transitionRecognizedText;
@property (nonatomic, strong) NSDate *transitionTriggerDate;
@property (nonatomic) NSInteger transitionFramesRemaining;
@property (nonatomic, copy) NSString *detailCandidateTarget;
@property (nonatomic) NSInteger detailCandidateHits;
@property (nonatomic) NSInteger listCandidateHits;
@property (nonatomic) BOOL transitionArmed;
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
        _lastFrameTime = 0;
        _ciContext = [CIContext contextWithOptions:nil];

        _recentFrameJPEGs = [NSMutableArray array];
        _recentFrameDates = [NSMutableArray array];
        _transitionFrameJPEGs = [NSMutableArray array];
        _transitionFrameDates = [NSMutableArray array];
        _transitionFramesRemaining = 0;
        _transitionArmed = YES;
        _paywallSnapshotSaved = NO;
        _detailCandidateHits = 0;
        _listCandidateHits = 0;
    }
    return self;
}

- (void)setStatus:(NSString *)status {
    self.statusText = status ?: @"";
    dispatch_async(dispatch_get_main_queue(), ^{
        [[NSNotificationCenter defaultCenter] postNotificationName:APCaptureStatusNotification object:nil];
    });
}

- (void)resetTransitionState {
    self.lastTarget = nil;
    self.paywallSnapshotSaved = NO;
    self.transitionArmed = YES;
    self.detailCandidateTarget = nil;
    self.detailCandidateHits = 0;
    self.listCandidateHits = 0;
    self.transitionFramesRemaining = 0;
    self.transitionTarget = nil;
    self.transitionRecognizedText = nil;
    self.transitionTriggerDate = nil;
    [self.transitionFrameJPEGs removeAllObjects];
    [self.transitionFrameDates removeAllObjects];
    [self.recentFrameJPEGs removeAllObjects];
    [self.recentFrameDates removeAllObjects];
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
    if ([picker respondsToSelector:addSel]) {
        ((void (*)(id, SEL, id))objc_msgSend)(picker, addSel, self);
    }

    SEL activeSel = NSSelectorFromString(@"setActive:");
    if ([picker respondsToSelector:activeSel]) {
        ((void (*)(id, SEL, BOOL))objc_msgSend)(picker, activeSel, YES);
    }

    SEL presentSel = NSSelectorFromString(@"present");
    if ([picker respondsToSelector:presentSel]) {
        [self resetTransitionState];
        [self setStatus:@"Выберите «Весь экран». Затем откройте AllPredictor и нажмите Lucky Jet/Rocket Queen."];
        ((void (*)(id, SEL))objc_msgSend)(picker, presentSel);
    } else {
        [self setStatus:@"Системный выбор экрана недоступен."];
    }
}

- (void)stopCapture {
    dispatch_async(self.sampleQueue, ^{
        if (self.transitionFrameJPEGs.count > 0 && self.transitionTarget.length) {
            self.transitionFramesRemaining = 0;
            [self finalizeTransitionCapture];
        }
    });

    id stream = self.stream;
    self.stream = nil;
    self.capturing = NO;

    if (stream) {
        SEL stopSel = NSSelectorFromString(@"stopCaptureWithCompletionHandler:");
        if ([stream respondsToSelector:stopSel]) {
            void (^completion)(NSError *) = ^(NSError *error) {
                [self setStatus:error ? [NSString stringWithFormat:@"Остановлено: %@", error.localizedDescription]
                                     : @"Сбор остановлен. Данные сохранены."];
            };
            ((void (*)(id, SEL, id))objc_msgSend)(stream, stopSel, completion);
        }
    }

    if (self.picker) {
        SEL removeSel = NSSelectorFromString(@"removeObserver:");
        if ([self.picker respondsToSelector:removeSel]) {
            ((void (*)(id, SEL, id))objc_msgSend)(self.picker, removeSel, self);
        }
        SEL activeSel = NSSelectorFromString(@"setActive:");
        if ([self.picker respondsToSelector:activeSel]) {
            ((void (*)(id, SEL, BOOL))objc_msgSend)(self.picker, activeSel, NO);
        }
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
        [self setStatus:@"Сбор активен. Нажмите Lucky Jet/Rocket Queen — переход сохранится автоматически."];
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
    stream = ((id (*)(id, SEL, id, id, id))objc_msgSend)(
        stream,
        NSSelectorFromString(@"initWithFilter:configuration:delegate:"),
        filter,
        config,
        self
    );
    if (!stream) {
        [self setStatus:@"Не удалось инициализировать захват экрана."];
        return;
    }

    NSError *error = nil;
    BOOL ok = ((BOOL (*)(id, SEL, id, NSInteger, dispatch_queue_t, NSError **))objc_msgSend)(
        stream,
        NSSelectorFromString(@"addStreamOutput:type:sampleHandlerQueue:error:"),
        self,
        0,
        self.sampleQueue,
        &error
    );
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
            [self setStatus:@"Сбор активен. Хранятся ~4 секунды ДО нажатия и ~3 секунды ПОСЛЕ перехода."];
        }
    };
    ((void (*)(id, SEL, id))objc_msgSend)(stream, NSSelectorFromString(@"startCaptureWithCompletionHandler:"), completion);
}

- (void)stream:(id)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(NSInteger)type {
    if (type != 0 || !sampleBuffer) return;
    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!imageBuffer) return;

    CFTimeInterval now = CACurrentMediaTime();
    if (now - self.lastFrameTime >= 0.18) {
        self.lastFrameTime = now;
        [self bufferFrame:imageBuffer];
    }
    if (now - self.lastOCRTime >= 0.28) {
        self.lastOCRTime = now;
        [self runOCR:imageBuffer];
    }
}

- (void)stream:(id)stream didStopWithError:(NSError *)error {
    self.capturing = NO;
    if (self.transitionFrameJPEGs.count > 0 && self.transitionTarget.length) {
        self.transitionFramesRemaining = 0;
        [self finalizeTransitionCapture];
    }
    [self setStatus:[NSString stringWithFormat:@"Захват остановлен: %@", error.localizedDescription ?: @"системой"]];
}

- (void)streamDidBecomeInactive:(id)stream {
    self.capturing = NO;
    if (self.transitionFrameJPEGs.count > 0 && self.transitionTarget.length) {
        self.transitionFramesRemaining = 0;
        [self finalizeTransitionCapture];
    }
    [self setStatus:@"Захват экрана стал неактивен."];
}

#pragma mark - Rolling frame buffer

- (NSData *)jpegDataForPixelBuffer:(CVPixelBufferRef)pixelBuffer {
    CIImage *source = [CIImage imageWithCVPixelBuffer:pixelBuffer];
    if (!source) return nil;

    CGRect extent = source.extent;
    CGFloat targetWidth = MIN(720.0, CGRectGetWidth(extent));
    CGFloat scale = targetWidth / MAX(CGRectGetWidth(extent), 1.0);
    CIImage *scaled = [source imageByApplyingTransform:CGAffineTransformMakeScale(scale, scale)];
    CGImageRef cg = [self.ciContext createCGImage:scaled fromRect:scaled.extent];
    if (!cg) return nil;

    UIImage *image = [UIImage imageWithCGImage:cg];
    CGImageRelease(cg);
    return UIImageJPEGRepresentation(image, 0.62);
}

- (void)bufferFrame:(CVPixelBufferRef)pixelBuffer {
    NSData *jpeg = [self jpegDataForPixelBuffer:pixelBuffer];
    if (!jpeg) return;

    NSDate *date = [NSDate date];
    [self.recentFrameJPEGs addObject:jpeg];
    [self.recentFrameDates addObject:date];

    while (self.recentFrameJPEGs.count > 24) {
        [self.recentFrameJPEGs removeObjectAtIndex:0];
        [self.recentFrameDates removeObjectAtIndex:0];
    }

    if (self.transitionFramesRemaining > 0 && self.transitionTarget.length) {
        [self.transitionFrameJPEGs addObject:jpeg];
        [self.transitionFrameDates addObject:date];
        self.transitionFramesRemaining -= 1;
        if (self.transitionFramesRemaining <= 0) {
            [self finalizeTransitionCapture];
        }
    }
}

- (void)startTransitionCaptureForTarget:(NSString *)target recognizedText:(NSString *)recognizedText {
    if (!self.transitionArmed || target.length == 0 || self.transitionFramesRemaining > 0) return;

    self.transitionArmed = NO;
    self.lastTarget = target;
    self.paywallSnapshotSaved = NO;

    self.transitionTarget = target;
    self.transitionRecognizedText = recognizedText ?: @"";
    self.transitionTriggerDate = [NSDate date];

    [self.transitionFrameJPEGs removeAllObjects];
    [self.transitionFrameDates removeAllObjects];
    [self.transitionFrameJPEGs addObjectsFromArray:self.recentFrameJPEGs];
    [self.transitionFrameDates addObjectsFromArray:self.recentFrameDates];

    self.transitionFramesRemaining = 18;

    [[CaptureStore shared] addKind:@"event"
                             value:@"target_transition_detected"
                           context:[NSString stringWithFormat:@"%@ | %@", target, recognizedText ?: @""]];

    [self setStatus:[NSString stringWithFormat:@"%@ открыт. Сохраняю кадры до и после перехода…", target]];
}

- (void)finalizeTransitionCapture {
    if (self.transitionFrameJPEGs.count == 0 || self.transitionTarget.length == 0) return;

    NSArray<NSData *> *framesData = [self.transitionFrameJPEGs copy];
    NSArray<NSDate *> *frameDates = [self.transitionFrameDates copy];
    NSString *target = [self.transitionTarget copy];
    NSString *recognizedText = [self.transitionRecognizedText copy] ?: @"";
    NSDate *triggerDate = self.transitionTriggerDate ?: [NSDate date];

    [self.transitionFrameJPEGs removeAllObjects];
    [self.transitionFrameDates removeAllObjects];
    self.transitionFramesRemaining = 0;
    self.transitionTarget = nil;
    self.transitionRecognizedText = nil;
    self.transitionTriggerDate = nil;

    NSDateFormatter *df = [NSDateFormatter new];
    df.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    df.timeZone = [NSTimeZone localTimeZone];
    df.dateFormat = @"yyyyMMdd-HHmmss-SSS";
    NSString *stamp = [df stringFromDate:triggerDate];

    NSURL *documents = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
    NSURL *root = [documents URLByAppendingPathComponent:@"TargetTransitions" isDirectory:YES];
    NSURL *folder = [root URLByAppendingPathComponent:[NSString stringWithFormat:@"%@-%@-open", stamp, target] isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];

    NSMutableArray *frames = [NSMutableArray array];
    for (NSUInteger i = 0; i < framesData.count; i++) {
        NSString *name = [NSString stringWithFormat:@"frame_%02lu.jpg", (unsigned long)i];
        NSURL *url = [folder URLByAppendingPathComponent:name];
        [framesData[i] writeToURL:url atomically:YES];

        NSDate *date = i < frameDates.count ? frameDates[i] : triggerDate;
        NSTimeInterval relativeMs = [date timeIntervalSinceDate:triggerDate] * 1000.0;
        NSString *phase = relativeMs < -120.0 ? @"before" : (relativeMs > 120.0 ? @"after" : @"trigger");

        [frames addObject:@{
            @"file": name,
            @"time": @([date timeIntervalSince1970]),
            @"relativeMs": @((NSInteger)llround(relativeMs)),
            @"phase": phase
        }];
    }

    NSDictionary *manifest = @{
        @"format": @"APCollector/transition-1",
        @"target": target,
        @"triggerTime": @([triggerDate timeIntervalSince1970]),
        @"recognizedText": recognizedText,
        @"frameCount": @(framesData.count),
        @"frames": frames
    };

    NSData *json = [NSJSONSerialization dataWithJSONObject:manifest options:NSJSONWritingPrettyPrinted error:nil];
    [json writeToURL:[folder URLByAppendingPathComponent:@"manifest.json"] atomically:YES];

    [recognizedText writeToURL:[folder URLByAppendingPathComponent:@"recognized_text.txt"]
                    atomically:YES
                      encoding:NSUTF8StringEncoding
                         error:nil];

    [[CaptureStore shared] addKind:@"event"
                             value:@"target_transition_frames_saved"
                           context:[NSString stringWithFormat:@"%@ | %@", target, folder.lastPathComponent]];

    [self setStatus:[NSString stringWithFormat:@"%@ пойман. Кадры: Files → AP Collector → TargetTransitions → %@",
                     target,
                     folder.lastPathComponent]];
}

- (void)saveRecentFramesWithReason:(NSString *)reason recognizedText:(NSString *)recognizedText {
    if (self.recentFrameJPEGs.count == 0) return;

    NSDateFormatter *df = [NSDateFormatter new];
    df.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    df.timeZone = [NSTimeZone localTimeZone];
    df.dateFormat = @"yyyyMMdd-HHmmss-SSS";
    NSString *stamp = [df stringFromDate:[NSDate date]];

    NSURL *documents = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
    NSURL *root = [documents URLByAppendingPathComponent:@"PreSubscription" isDirectory:YES];
    NSString *safeReason = reason.length ? reason : @"capture";
    NSURL *folder = [root URLByAppendingPathComponent:[NSString stringWithFormat:@"%@-%@", stamp, safeReason] isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];

    NSMutableArray *frames = [NSMutableArray array];
    for (NSUInteger i = 0; i < self.recentFrameJPEGs.count; i++) {
        NSString *name = [NSString stringWithFormat:@"frame_%02lu.jpg", (unsigned long)i];
        NSURL *url = [folder URLByAppendingPathComponent:name];
        [self.recentFrameJPEGs[i] writeToURL:url atomically:YES];
        NSDate *d = i < self.recentFrameDates.count ? self.recentFrameDates[i] : [NSDate date];
        [frames addObject:@{ @"file": name, @"time": @([d timeIntervalSince1970]) }];
    }

    NSDictionary *manifest = @{
        @"reason": safeReason,
        @"target": self.lastTarget ?: @"unknown",
        @"recognizedText": recognizedText ?: @"",
        @"frameCount": @(self.recentFrameJPEGs.count),
        @"frames": frames
    };
    NSData *json = [NSJSONSerialization dataWithJSONObject:manifest options:NSJSONWritingPrettyPrinted error:nil];
    [json writeToURL:[folder URLByAppendingPathComponent:@"manifest.json"] atomically:YES];

    [[CaptureStore shared] addKind:@"event"
                             value:@"pre_subscription_frames_saved"
                           context:[NSString stringWithFormat:@"%@ | %@ | %@",
                                    self.lastTarget ?: @"unknown",
                                    folder.lastPathComponent,
                                    recognizedText ?: @""]];

    [self setStatus:[NSString stringWithFormat:@"Окно подписки поймано для %@. Кадры сохранены в PreSubscription.",
                     self.lastTarget ?: @"экрана"]];
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

    request.recognitionLevel = VNRequestTextRecognitionLevelFast;
    request.usesLanguageCorrection = NO;
    request.recognitionLanguages = @[@"en-US", @"ru-RU", @"fr-FR"];

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCVPixelBuffer:pixelBuffer options:@{}];
    [handler performRequests:@[request] error:nil];
}

- (BOOL)containsBackMarkerInLine:(NSString *)line {
    NSString *s = line.lowercaseString;
    if (![s containsString:@"predictors"]) return NO;
    return [s containsString:@"<"] || [s containsString:@"‹"] || [s containsString:@"«"];
}

- (BOOL)lineLooksLucky:(NSString *)line {
    NSString *s = line.lowercaseString;
    return [s containsString:@"lucky jet"] ||
           [s containsString:@"luckv jet"] ||
           [s containsString:@"ucky jet"] ||
           [s containsString:@"uckv jet"] ||
           ([s containsString:@"lucky"] && [s containsString:@"jet"]) ||
           ([s containsString:@"luckv"] && [s containsString:@"jet"]);
}

- (BOOL)lineLooksRocket:(NSString *)line {
    NSString *s = line.lowercaseString;
    return [s containsString:@"rocket queen"] ||
           ([s containsString:@"rocket"] && [s containsString:@"queen"]);
}

- (NSString *)detailTargetFromLines:(NSArray<NSString *> *)lines joinedLower:(NSString *)joinedLower {
    BOOL hasPredictors = [joinedLower containsString:@"predictors"];
    if (!hasPredictors) return nil;

    BOOL hasBackMarker = NO;
    BOOL lucky = NO;
    BOOL rocketWord = NO;
    BOOL queenWord = NO;
    BOOL jetWord = NO;

    for (NSString *line in lines) {
        NSString *trim = [[line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] lowercaseString];
        if (trim.length == 0) continue;

        if ([self containsBackMarkerInLine:trim]) hasBackMarker = YES;
        if ([self lineLooksLucky:trim]) lucky = YES;
        if ([self lineLooksRocket:trim]) {
            rocketWord = YES;
            queenWord = YES;
        }
        if ([trim containsString:@"rocket"]) rocketWord = YES;
        if ([trim containsString:@"queen"]) queenWord = YES;
        if ([trim isEqualToString:@"jet"] ||
            [trim hasSuffix:@" jet"] ||
            [trim containsString:@"luckv jet"] ||
            [trim containsString:@"lucky jet"]) {
            jetWord = YES;
        }
    }

    BOOL rocket = rocketWord && queenWord;

    if (hasBackMarker) {
        if ((lucky || jetWord) && !rocket) return @"LuckyJet";
        if (rocket && !(lucky || jetWord)) return @"RocketQueen";
    }

    if (lucky && !rocket) return @"LuckyJet";
    if (rocket && !lucky) return @"RocketQueen";
    return nil;
}

- (void)processRecognizedLines:(NSArray<NSString *> *)lines {
    if (lines.count == 0) return;

    NSString *joined = [lines componentsJoinedByString:@" | "];
    NSString *joinedLower = joined.lowercaseString;

    BOOL hasPredictors = [joinedLower containsString:@"predictors"];
    BOOL luckyAny = [joinedLower containsString:@"lucky jet"] ||
                    [joinedLower containsString:@"luckv jet"] ||
                    [joinedLower containsString:@"ucky jet"] ||
                    [joinedLower containsString:@"uckv jet"];
    BOOL rocketAny = [joinedLower containsString:@"rocket"] && [joinedLower containsString:@"queen"];

    BOOL hasBackMarker = NO;
    for (NSString *line in lines) {
        if ([self containsBackMarkerInLine:line]) {
            hasBackMarker = YES;
            break;
        }
    }

    BOOL looksLikeList = hasPredictors && luckyAny && rocketAny && !hasBackMarker;
    if (looksLikeList) {
        self.listCandidateHits += 1;
        if (self.listCandidateHits >= 2) {
            self.transitionArmed = YES;
            self.lastTarget = nil;
            self.paywallSnapshotSaved = NO;
            self.detailCandidateTarget = nil;
            self.detailCandidateHits = 0;
        }
    } else {
        self.listCandidateHits = 0;
    }

    NSString *candidate = [self detailTargetFromLines:lines joinedLower:joinedLower];
    if (candidate.length) {
        if ([candidate isEqualToString:self.detailCandidateTarget]) {
            self.detailCandidateHits += 1;
        } else {
            self.detailCandidateTarget = candidate;
            self.detailCandidateHits = 1;
        }

        NSInteger neededHits = hasBackMarker ? 1 : 2;
        if (self.transitionArmed && self.detailCandidateHits >= neededHits) {
            [self startTransitionCaptureForTarget:candidate recognizedText:joined];
            self.detailCandidateHits = 0;
        }
    } else if (!looksLikeList) {
        self.detailCandidateTarget = nil;
        self.detailCandidateHits = 0;
    }

    NSArray<NSString *> *paywallKeywords = @[
        @"subscribe", @"subscription", @"abonnement", @"s'abonner", @"abonner",
        @"paiement", @"payment", @"purchase", @"acheter", @"unlock", @"débloquer",
        @"подпис", @"оплат", @"купить", @"активир", @"activation", @"code d'activation"
    ];

    BOOL paywall = NO;
    for (NSString *kw in paywallKeywords) {
        if ([joinedLower containsString:kw]) {
            paywall = YES;
            break;
        }
    }

    if (paywall && self.lastTarget.length && !self.paywallSnapshotSaved) {
        self.paywallSnapshotSaved = YES;
        [self saveRecentFramesWithReason:@"paywall" recognizedText:joined];
    }

    NSRegularExpression *coef = [NSRegularExpression regularExpressionWithPattern:@"(?<![0-9])(?:[1-9][0-9]{0,2})(?:[\\.,][0-9]{1,3})?\\s*[xX×](?![A-Za-z])"
                                                                          options:0
                                                                            error:nil];
    NSRegularExpression *url = [NSRegularExpression regularExpressionWithPattern:@"https?://[^\\s\\]\\)>,]+"
                                                                         options:NSRegularExpressionCaseInsensitive
                                                                           error:nil];
    NSRegularExpression *domain = [NSRegularExpression regularExpressionWithPattern:@"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:com|net|org|io|app|co|fr|ua|ru)(?:/[^\\s\\]\\)>,]*)?"
                                                                            options:NSRegularExpressionCaseInsensitive
                                                                              error:nil];

    NSArray<NSString *> *keywords = @[
        @"lucky", @"luckv", @"jet", @"rocket", @"queen", @"predict",
        @"коэф", @"coefficient", @"round", @"раунд", @"multiplier",
        @"subscribe", @"abonnement", @"подпис"
    ];

    for (NSString *line in lines) {
        NSString *trim = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (trim.length == 0) continue;
        NSRange full = NSMakeRange(0, trim.length);

        for (NSTextCheckingResult *m in [coef matchesInString:trim options:0 range:full]) {
            NSString *value = [trim substringWithRange:m.range];
            value = [[value stringByReplacingOccurrencesOfString:@"," withString:@"."]
                     stringByReplacingOccurrencesOfString:@"×" withString:@"x"];
            value = [value stringByReplacingOccurrencesOfString:@" " withString:@""];
            [[CaptureStore shared] addKind:@"coefficient" value:value context:trim];
        }

        for (NSTextCheckingResult *m in [url matchesInString:trim options:0 range:full]) {
            NSString *value = [trim substringWithRange:m.range];
            [[CaptureStore shared] addKind:@"url" value:value context:trim];
        }

        for (NSTextCheckingResult *m in [domain matchesInString:trim options:0 range:full]) {
            NSString *value = [trim substringWithRange:m.range];
            [[CaptureStore shared] addKind:@"domain" value:value context:trim];
        }

        NSString *lower = trim.lowercaseString;
        BOOL selfText = [lower containsString:@"сбор активен"] ||
                        [lower containsString:@"перейдите в allpredictor"] ||
                        [lower containsString:@"кадры до подписки"] ||
                        [lower containsString:@"кадры до и после"];

        BOOL relevant = NO;
        for (NSString *kw in keywords) {
            if ([lower containsString:kw]) {
                relevant = YES;
                break;
            }
        }

        if (relevant && !selfText && trim.length <= 220) {
            [[CaptureStore shared] addKind:@"text" value:trim context:trim];
        }
    }
}

@end
