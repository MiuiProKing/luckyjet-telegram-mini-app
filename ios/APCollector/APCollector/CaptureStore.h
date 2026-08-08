#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSString * const APCaptureStoreDidChangeNotification;

@interface CaptureStore : NSObject
+ (instancetype)shared;
@property (nonatomic, readonly) NSArray<NSDictionary *> *entries;
- (void)addKind:(NSString *)kind value:(NSString *)value context:(NSString *)context;
- (void)clear;
- (NSURL *)jsonURL;
- (NSURL *)csvURL;
@end

NS_ASSUME_NONNULL_END
