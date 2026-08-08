#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#import <objc/message.h>

static const void *LJRecentRoundsKey = &LJRecentRoundsKey;
static IMP LJOriginalCollectorScript = NULL;
static IMP LJOriginalMessageHandler = NULL;
static IMP LJOriginalAcceptBig = NULL;
static IMP LJOriginalStartSession = NULL;

typedef NSString *(*CollectorScriptFn)(id, SEL);
typedef void (*MessageHandlerFn)(id, SEL, WKUserContentController *, WKScriptMessage *);
typedef void (*AcceptBigFn)(id, SEL, double, NSString *, NSString *, NSString *);
typedef void (*VoidFn)(id, SEL);

static NSMutableArray<NSNumber *> *LJRecentRounds(id self) {
    NSMutableArray *a = objc_getAssociatedObject(self, LJRecentRoundsKey);
    if (!a) {
        a = [NSMutableArray array];
        objc_setAssociatedObject(self, LJRecentRoundsKey, a, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    return a;
}

static NSString *LJCollectorScript(id self, SEL _cmd) {
    NSString *original = ((CollectorScriptFn)LJOriginalCollectorScript)(self, _cmd);
    NSString *old = @"if(!st.sent&&v!==null&&v>=10&&(now-st.changed)>=1000){st.sent=true;emitBig(v,'dom-stable',text);}";
    NSString *new = @"if(!st.sent&&v!==null&&v>=1&&(now-st.changed)>=1000){st.sent=true;post({type:'round',value:v,source:'dom-stable',context:text,url:location.href});}";
    if ([original containsString:old]) return [original stringByReplacingOccurrencesOfString:old withString:new];
    return original;
}

static void LJStartSession(id self, SEL _cmd) {
    [LJRecentRounds(self) removeAllObjects];
    ((VoidFn)LJOriginalStartSession)(self, _cmd);
}

static void LJAcceptBig(id self, SEL _cmd, double value, NSString *source, NSString *context, NSString *pageURL) {
    NSArray *before = [LJRecentRounds(self) copy];
    NSUInteger oldCount = 0;
    @try { oldCount = [[self valueForKey:@"events"] count]; } @catch (__unused NSException *e) {}

    ((AcceptBigFn)LJOriginalAcceptBig)(self, _cmd, value, source, context, pageURL);

    @try {
        NSMutableArray *events = [self valueForKey:@"events"];
        if (events.count > oldCount) {
            NSUInteger idx = events.count - 1;
            NSMutableDictionary *event = [events[idx] mutableCopy];
            event[@"previous5Coefficients"] = before ?: @[];
            NSMutableArray *labels = [NSMutableArray array];
            for (NSNumber *n in before) [labels addObject:[NSString stringWithFormat:@"%.2fx", n.doubleValue]];
            event[@"previous5Text"] = [labels componentsJoinedByString:@" • "];
            events[idx] = event;
            if ([self respondsToSelector:NSSelectorFromString(@"saveFiles")]) {
                ((void(*)(id,SEL))objc_msgSend)(self, NSSelectorFromString(@"saveFiles"));
            }
            UITableView *table = [self valueForKey:@"tableView"];
            [table reloadData];
        }
    } @catch (__unused NSException *e) {}
}

static void LJMessageHandler(id self, SEL _cmd, WKUserContentController *uc, WKScriptMessage *message) {
    if ([message.name isEqualToString:@"lj10"] && [message.body isKindOfClass:NSDictionary.class]) {
        NSDictionary *d = message.body;
        if ([[d[@"type"] description] isEqualToString:@"round"]) {
            double value = [d[@"value"] doubleValue];
            BOOL collecting = NO;
            @try { collecting = [[self valueForKey:@"collecting"] boolValue]; } @catch (__unused NSException *e) {}
            if (collecting && value >= 1.0 && value < 1000.0) {
                if (value >= 10.0) {
                    SEL s = NSSelectorFromString(@"acceptBig:source:context:pageURL:");
                    ((void(*)(id,SEL,double,id,id,id))objc_msgSend)(self, s, value, @"dom-stable", [d[@"context"] description], [d[@"url"] description]);
                }
                NSMutableArray *recent = LJRecentRounds(self);
                [recent addObject:@(value)];
                while (recent.count > 5) [recent removeObjectAtIndex:0];
            }
            return;
        }
    }
    ((MessageHandlerFn)LJOriginalMessageHandler)(self, _cmd, uc, message);
}

__attribute__((constructor)) static void LJInstallRecent5Tracker(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        Class cls = NSClassFromString(@"LJCollectorViewController");
        if (!cls) return;

        Method m = class_getInstanceMethod(cls, NSSelectorFromString(@"collectorScript"));
        if (m) { LJOriginalCollectorScript = method_getImplementation(m); method_setImplementation(m, (IMP)LJCollectorScript); }

        m = class_getInstanceMethod(cls, NSSelectorFromString(@"startNewSession"));
        if (m) { LJOriginalStartSession = method_getImplementation(m); method_setImplementation(m, (IMP)LJStartSession); }

        m = class_getInstanceMethod(cls, @selector(userContentController:didReceiveScriptMessage:));
        if (m) { LJOriginalMessageHandler = method_getImplementation(m); method_setImplementation(m, (IMP)LJMessageHandler); }

        m = class_getInstanceMethod(cls, NSSelectorFromString(@"acceptBig:source:context:pageURL:"));
        if (m) { LJOriginalAcceptBig = method_getImplementation(m); method_setImplementation(m, (IMP)LJAcceptBig); }
    });
}
