#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>

NS_ASSUME_NONNULL_BEGIN
extern NSString * const APCaptureStatusNotification;

@interface ScreenCaptureManager : NSObject
+ (instancetype)shared;
@property (nonatomic, readonly) BOOL capturing;
@property (nonatomic, copy, readonly) NSString *statusText;
- (void)presentSystemPicker;
- (void)stopCapture;
@end
NS_ASSUME_NONNULL_END
