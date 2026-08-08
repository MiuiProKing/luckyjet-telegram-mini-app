#import "CaptureStore.h"

NSString * const APCaptureStoreDidChangeNotification = @"APCaptureStoreDidChangeNotification";

@interface CaptureStore ()
@property (nonatomic) NSMutableArray<NSDictionary *> *mutableEntries;
@property (nonatomic) dispatch_queue_t queue;
@property (nonatomic) NSMutableDictionary<NSString *, NSDate *> *lastSeen;
@property (nonatomic) NSDateFormatter *isoFormatter;
@end

@implementation CaptureStore

+ (instancetype)shared {
    static CaptureStore *s;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ s = [CaptureStore new]; });
    return s;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _queue = dispatch_queue_create("com.miuiproking.apcollector.store", DISPATCH_QUEUE_SERIAL);
        _mutableEntries = [NSMutableArray array];
        _lastSeen = [NSMutableDictionary dictionary];
        _isoFormatter = [NSDateFormatter new];
        _isoFormatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
        _isoFormatter.timeZone = [NSTimeZone timeZoneForSecondsFromGMT:0];
        _isoFormatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
        [self loadExisting];
    }
    return self;
}

- (NSArray<NSDictionary *> *)entries {
    __block NSArray *copy;
    dispatch_sync(self.queue, ^{ copy = [self.mutableEntries copy]; });
    return copy ?: @[];
}

- (NSURL *)documentsDirectory {
    return [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
}

- (NSURL *)jsonURL { return [[self documentsDirectory] URLByAppendingPathComponent:@"allpredictor_capture.json"]; }
- (NSURL *)csvURL { return [[self documentsDirectory] URLByAppendingPathComponent:@"allpredictor_capture.csv"]; }

- (void)loadExisting {
    NSData *data = [NSData dataWithContentsOfURL:[self jsonURL]];
    if (!data) return;
    NSDictionary *payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    NSArray *saved = [payload isKindOfClass:[NSDictionary class]] ? payload[@"entries"] : nil;
    if ([saved isKindOfClass:[NSArray class]]) [self.mutableEntries addObjectsFromArray:saved];
}

- (void)addKind:(NSString *)kind value:(NSString *)value context:(NSString *)context {
    if (kind.length == 0 || value.length == 0) return;
    NSString *key = [NSString stringWithFormat:@"%@|%@|%@", kind, value, context ?: @""];
    NSDate *now = [NSDate date];
    dispatch_async(self.queue, ^{
        NSDate *last = self.lastSeen[key];
        if (last && [now timeIntervalSinceDate:last] < 6.0) return;
        self.lastSeen[key] = now;
        NSDictionary *entry = @{
            @"timestamp": [self.isoFormatter stringFromDate:now],
            @"kind": kind,
            @"value": value,
            @"context": context ?: @""
        };
        [self.mutableEntries addObject:entry];
        if (self.mutableEntries.count > 5000) {
            [self.mutableEntries removeObjectsInRange:NSMakeRange(0, self.mutableEntries.count - 5000)];
        }
        [self persistLocked];
        dispatch_async(dispatch_get_main_queue(), ^{
            [[NSNotificationCenter defaultCenter] postNotificationName:APCaptureStoreDidChangeNotification object:nil];
        });
    });
}

- (void)clear {
    dispatch_async(self.queue, ^{
        [self.mutableEntries removeAllObjects];
        [self.lastSeen removeAllObjects];
        [self persistLocked];
        dispatch_async(dispatch_get_main_queue(), ^{
            [[NSNotificationCenter defaultCenter] postNotificationName:APCaptureStoreDidChangeNotification object:nil];
        });
    });
}

- (void)persistLocked {
    NSDictionary *payload = @{
        @"format": @"APCollector/1",
        @"updatedAt": [self.isoFormatter stringFromDate:[NSDate date]],
        @"entries": self.mutableEntries
    };
    NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingPrettyPrinted error:nil];
    [json writeToURL:[self jsonURL] atomically:YES];

    NSMutableString *csv = [NSMutableString stringWithString:@"timestamp,kind,value,context\n"];
    for (NSDictionary *e in self.mutableEntries) {
        NSArray *cols = @[e[@"timestamp"] ?: @"", e[@"kind"] ?: @"", e[@"value"] ?: @"", e[@"context"] ?: @""];
        NSMutableArray *escaped = [NSMutableArray arrayWithCapacity:4];
        for (NSString *c in cols) {
            NSString *s = [[c description] stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""];
            [escaped addObject:[NSString stringWithFormat:@"\"%@\"", s]];
        }
        [csv appendFormat:@"%@\n", [escaped componentsJoinedByString:@","]];
    }
    [csv writeToURL:[self csvURL] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

@end
